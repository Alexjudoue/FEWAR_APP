# -*- coding: utf-8 -*-
"""
FEVAR core engine - sans interface graphique.

Moteur de calcul extrait du prototype :
- lecture optionnelle VTK/VTP/VTU/STL via PyVista ;
- calcul du Parallel Transport Frame ;
- conversion cartésien global -> coordonnées locales (s, theta) ;
- mapping pochoir 12 x 8 ;
- alerte trou / stent ;
- guide opératoire textuel.

Aucune dépendance PyQt5, Tkinter, Matplotlib ou pyvistaqt.
PyVista est utilisé uniquement pour lire les fichiers VTK côté backend.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple, Union
import argparse
import json

import numpy as np


# ============================================================
# PARAMÈTRES DU POCHOIR
# ============================================================

N_HOLES_CIRC = 12
N_LINES_LENGTH = 8
HOLE_ANGLE_STEP_DEG = 30.0

STENCIL_LINE_POSITIONS_MM = np.array(
    [8.0, 16.0, 24.0, 32.0, 40.0, 48.0, 56.0, 64.0],
    dtype=float,
)
STENCIL_TOTAL_LENGTH_MM = 71.5
STENCIL_RADIUS_MM = 13.5


@dataclass
class WindowPoint:
    """Point anatomique à fenêtrer dans le repère global patient/scanner."""
    name: str
    point: np.ndarray


@dataclass
class PlanningConfig:
    """Paramètres de sécurité pour le calcul."""
    longitudinal_tolerance_mm: float = 4.0
    angular_tolerance_deg: float = 12.0
    direct_stent_distance_tolerance_mm: float = 0.75
    max_stent_points: int = 80000
    radial_tolerance_mm: Optional[float] = None


# ============================================================
# OUTILS MATHÉMATIQUES
# ============================================================

def normalize(v: Union[np.ndarray, Sequence[float]]) -> np.ndarray:
    arr = np.asarray(v, dtype=float)
    n = np.linalg.norm(arr)
    if n < 1e-12:
        return arr.copy()
    return arr / n


def rodrigues(v: np.ndarray, k: np.ndarray, theta: float) -> np.ndarray:
    k = normalize(k)
    return (
        v * np.cos(theta)
        + np.cross(k, v) * np.sin(theta)
        + k * np.dot(k, v) * (1.0 - np.cos(theta))
    )


def angular_difference_deg(a: float, b: float) -> float:
    return abs((float(a) - float(b) + 180.0) % 360.0 - 180.0)


def signed_angular_difference_deg(a: float, b: float) -> float:
    return (float(a) - float(b) + 180.0) % 360.0 - 180.0


def theta_to_clock(theta_deg_360: float) -> str:
    theta_deg_360 = float(theta_deg_360) % 360.0
    total_minutes = theta_deg_360 / 360.0 * 12.0 * 60.0
    hours = int(total_minutes // 60)
    minutes = int(round(total_minutes % 60))
    if minutes == 60:
        minutes = 0
        hours += 1
    return f"{hours % 12:02d}h{minutes:02d}"


# ============================================================
# LECTURE FICHIERS
# ============================================================

def _import_pyvista():
    try:
        import pyvista as pv  # type: ignore
    except Exception as exc:
        raise ImportError(
            "PyVista est nécessaire pour lire les fichiers VTK/VTP/VTU/STL. "
            "Installe-le avec : pip install pyvista"
        ) from exc
    return pv


def read_centerline_vtk(filepath: str) -> Tuple[np.ndarray, Any]:
    """Lit une centerline VTK/VTP/VTU et renvoie ses points ordonnés."""
    pv = _import_pyvista()
    mesh = pv.read(filepath)
    points = np.asarray(mesh.points, dtype=float)

    if points is None or len(points) < 3:
        raise ValueError("Le fichier centerline ne contient pas assez de points.")

    if not hasattr(mesh, "lines") or mesh.lines is None or len(mesh.lines) == 0:
        return points, mesh

    lines = np.asarray(mesh.lines)
    ordered_ids: List[int] = []
    i = 0
    while i < len(lines):
        n = int(lines[i])
        ids = lines[i + 1 : i + 1 + n]
        ordered_ids.extend(int(x) for x in ids)
        i += n + 1

    ordered_unique: List[int] = []
    seen = set()
    for idx in ordered_ids:
        if idx not in seen:
            ordered_unique.append(idx)
            seen.add(idx)

    centerline = points[ordered_unique]
    if len(centerline) < 3:
        return points, mesh
    return centerline, mesh


def read_points_vtk(filepath: str) -> Tuple[np.ndarray, Any]:
    pv = _import_pyvista()
    mesh = pv.read(filepath)
    points = np.asarray(mesh.points, dtype=float)
    if points is None or len(points) == 0:
        raise ValueError("Aucun point trouvé dans ce fichier.")
    return points, mesh


def read_stent_points(filepath: str) -> np.ndarray:
    pv = _import_pyvista()
    mesh = pv.read(filepath)
    points = np.asarray(mesh.points, dtype=float)
    if points is None or len(points) == 0:
        raise ValueError("Le fichier stent ne contient pas de points exploitables.")
    return points


# ============================================================
# PARALLEL TRANSPORT FRAME
# ============================================================

def closest_centerline_index(point: Sequence[float], centerline: np.ndarray) -> Tuple[int, float]:
    p = np.asarray(point, dtype=float)
    distances = np.linalg.norm(centerline - p, axis=1)
    idx = int(np.argmin(distances))
    return idx, float(distances[idx])


def compute_tangents(centerline: np.ndarray) -> np.ndarray:
    centerline = np.asarray(centerline, dtype=float)
    n = len(centerline)
    if n < 3:
        raise ValueError("La centerline doit contenir au moins 3 points.")

    T = np.zeros((n, 3), dtype=float)
    for i in range(n):
        if i == 0:
            T[i] = centerline[i + 1] - centerline[i]
        elif i == n - 1:
            T[i] = centerline[i] - centerline[i - 1]
        else:
            T[i] = centerline[i + 1] - centerline[i - 1]
        T[i] = normalize(T[i])
    return T


def transport_normal_between_tangents(normal: np.ndarray, old_T: np.ndarray, new_T: np.ndarray) -> np.ndarray:
    axis = np.cross(old_T, new_T)
    axis_norm = np.linalg.norm(axis)
    if axis_norm < 1e-10:
        return normal.copy()
    axis = axis / axis_norm
    angle = np.arccos(np.clip(np.dot(old_T, new_T), -1.0, 1.0))
    return rodrigues(normal, axis, angle)


def compute_ptf(
    centerline: np.ndarray,
    reference_point: Optional[Sequence[float]] = None,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, int]:
    """
    Calcule le Parallel Transport Frame.

    Retourne T, N, B, start_idx.
    N est la direction locale theta = 0°.
    B est la direction locale theta = 90°.
    """
    centerline = np.asarray(centerline, dtype=float)
    n = len(centerline)
    if n < 3:
        raise ValueError("La centerline doit contenir au moins 3 points.")

    T = compute_tangents(centerline)
    N = np.zeros((n, 3), dtype=float)
    B = np.zeros((n, 3), dtype=float)

    if reference_point is not None:
        ref = np.asarray(reference_point, dtype=float)
        start_idx, _ = closest_centerline_index(ref, centerline)
        origin = centerline[start_idx]
        d = ref - origin
        initial_N = d - np.dot(d, T[start_idx]) * T[start_idx]
        if np.linalg.norm(initial_N) < 1e-8:
            raise ValueError(
                "Le point de référence est trop proche de l'axe de la centerline. "
                "Choisis un point latéral pour définir theta = 0°."
            )
        N[start_idx] = normalize(initial_N)
    else:
        start_idx = 0
        ref_dir = np.array([0.0, 0.0, 1.0])
        if abs(np.dot(ref_dir, T[0])) > 0.9:
            ref_dir = np.array([1.0, 0.0, 0.0])
        N[0] = normalize(ref_dir - np.dot(ref_dir, T[0]) * T[0])

    B[start_idx] = normalize(np.cross(T[start_idx], N[start_idx]))

    for i in range(start_idx + 1, n):
        N[i] = transport_normal_between_tangents(N[i - 1], T[i - 1], T[i])
        N[i] = normalize(N[i] - np.dot(N[i], T[i]) * T[i])
        B[i] = normalize(np.cross(T[i], N[i]))

    for i in range(start_idx - 1, -1, -1):
        N[i] = transport_normal_between_tangents(N[i + 1], T[i + 1], T[i])
        N[i] = normalize(N[i] - np.dot(N[i], T[i]) * T[i])
        B[i] = normalize(np.cross(T[i], N[i]))

    return T, N, B, start_idx


def compute_curvilinear_abscissa(centerline: np.ndarray) -> np.ndarray:
    centerline = np.asarray(centerline, dtype=float)
    s = np.zeros(len(centerline), dtype=float)
    for i in range(1, len(centerline)):
        s[i] = s[i - 1] + np.linalg.norm(centerline[i] - centerline[i - 1])
    return s


# ============================================================
# COORDONNÉES LOCALES ET POCHOIR
# ============================================================

def cartesian_to_local_polar(
    point: Sequence[float],
    centerline: np.ndarray,
    T: np.ndarray,
    N: np.ndarray,
    B: np.ndarray,
    s: np.ndarray,
) -> Dict[str, float]:
    """Convertit un point cartésien global en coordonnées locales (s, theta)."""
    p = np.asarray(point, dtype=float)
    idx, dist = closest_centerline_index(p, centerline)
    d = p - centerline[idx]

    u = float(np.dot(d, N[idx]))
    v = float(np.dot(d, B[idx]))
    theta_rad = float(np.arctan2(v, u))
    theta_deg = float(np.degrees(theta_rad))

    if theta_rad < 0.0:
        theta_rad += 2.0 * np.pi
    if theta_deg < 0.0:
        theta_deg += 360.0

    return {
        "idx": int(idx),
        "distance_to_centerline": float(dist),
        "s": float(s[idx]),
        "theta_rad": float(theta_rad),
        "theta_deg": float(theta_deg),
        "theta_clock": theta_to_clock(theta_deg),
        "r": float(np.sqrt(u**2 + v**2)),
        "local_u": u,
        "local_v": v,
    }


def cylindrical_coordinates_for_point(point: Sequence[float], centerline: np.ndarray, N: np.ndarray, B: np.ndarray, s: np.ndarray) -> Dict[str, float]:
    dummy_T = np.zeros_like(centerline)
    return cartesian_to_local_polar(point, centerline, dummy_T, N, B, s)


def compute_stencil_line_positions(total_length: Optional[float] = None) -> np.ndarray:
    return STENCIL_LINE_POSITIONS_MM.copy()


def map_point_to_stencil(s_value: float, theta_deg: float, total_length: float) -> Dict[str, Any]:
    line_positions = compute_stencil_line_positions(total_length)
    line_idx = int(np.argmin(np.abs(line_positions - float(s_value))))
    line_num = line_idx + 1
    line_s = float(line_positions[line_idx])

    hole_idx = int(np.round(float(theta_deg) / HOLE_ANGLE_STEP_DEG)) % N_HOLES_CIRC
    hole_num = hole_idx + 1
    hole_theta_deg = float(hole_idx * HOLE_ANGLE_STEP_DEG)

    return {
        "outside_longitudinal_range": bool(float(s_value) < line_positions.min() or float(s_value) > line_positions.max()),
        "line_idx": int(line_idx),
        "line_num": int(line_num),
        "line_s": line_s,
        "hole_idx": int(hole_idx),
        "hole_num": int(hole_num),
        "hole_theta_deg": hole_theta_deg,
        "hole_theta_clock": theta_to_clock(hole_theta_deg),
        "delta_s": float(float(s_value) - line_s),
        "delta_theta_deg": float(signed_angular_difference_deg(theta_deg, hole_theta_deg)),
    }


def compute_hole_positioning_error(s_value: float, theta_deg: float, line_s: float, hole_theta_deg: float, radius_mm: float = STENCIL_RADIUS_MM) -> Dict[str, float]:
    height_error_mm = abs(float(s_value) - float(line_s))
    angular_error_deg = angular_difference_deg(float(theta_deg), float(hole_theta_deg))
    circumferential_error_mm = float(radius_mm) * np.radians(angular_error_deg)
    total_error_mm = float(np.sqrt(height_error_mm**2 + circumferential_error_mm**2))
    return {
        "height_error_mm": float(height_error_mm),
        "angular_error_deg": float(angular_error_deg),
        "circumferential_error_mm": float(circumferential_error_mm),
        "total_error_mm": total_error_mm,
    }


# ============================================================
# ALERTE STENT
# ============================================================

def _prepare_stent_points(stent_points: Optional[Union[np.ndarray, Sequence[Sequence[float]]]], max_points: int) -> Optional[np.ndarray]:
    if stent_points is None:
        return None
    pts = np.asarray(stent_points, dtype=float)
    if pts.ndim != 2 or pts.shape[1] != 3 or len(pts) == 0:
        return None
    if len(pts) > max_points:
        ids = np.linspace(0, len(pts) - 1, max_points).astype(int)
        pts = pts[ids]
    return pts


def minimum_distance_to_stent(point: Optional[Sequence[float]], stent_points: Optional[np.ndarray]) -> Optional[float]:
    if point is None or stent_points is None or len(stent_points) == 0:
        return None
    p = np.asarray(point, dtype=float)
    return float(np.min(np.linalg.norm(stent_points - p, axis=1)))


def check_hole_stent_collision(
    hole_s: float,
    hole_theta_deg: float,
    stent_points: Optional[Union[np.ndarray, Sequence[Sequence[float]]]],
    centerline: np.ndarray,
    N: np.ndarray,
    B: np.ndarray,
    s: np.ndarray,
    window_point: Optional[Sequence[float]] = None,
    longitudinal_tolerance_mm: float = 4.0,
    angular_tolerance_deg: float = 12.0,
    direct_stent_distance_tolerance_mm: float = 0.75,
    radial_tolerance_mm: Optional[float] = None,
    max_stent_points: int = 80000,
) -> Dict[str, Any]:
    """
    Détection de risque trou/stent.

    Test 1 : proximité en coordonnées cylindriques locales (s, theta).
    Test 2 : distance directe 3D si le point critique appartient au stent.
    """
    pts = _prepare_stent_points(stent_points, max_stent_points)
    if pts is None:
        return {
            "collision": False,
            "checked": False,
            "message": "Aucun stent chargé : collision non vérifiée.",
            "min_delta_s": None,
            "min_delta_theta": None,
            "n_close_points": 0,
            "min_distance_to_stent_mm": None,
            "direct_point_on_stent": False,
            "close_points": [],
        }

    direct_distance = minimum_distance_to_stent(window_point, pts)
    direct_hit = bool(direct_distance is not None and direct_distance <= direct_stent_distance_tolerance_mm)

    min_delta_s = np.inf
    min_delta_theta = np.inf
    close_points: List[Dict[str, Any]] = []

    window_polar = None
    if radial_tolerance_mm is not None and window_point is not None:
        window_polar = cylindrical_coordinates_for_point(window_point, centerline, N, B, s)

    for p in pts:
        cyl = cylindrical_coordinates_for_point(p, centerline, N, B, s)
        ds = abs(float(cyl["s"]) - float(hole_s))
        dtheta = angular_difference_deg(float(cyl["theta_deg"]), float(hole_theta_deg))
        min_delta_s = min(min_delta_s, ds)
        min_delta_theta = min(min_delta_theta, dtheta)

        close = ds <= longitudinal_tolerance_mm and dtheta <= angular_tolerance_deg
        if close and radial_tolerance_mm is not None and window_polar is not None:
            close = abs(float(cyl["r"]) - float(window_polar["r"])) <= radial_tolerance_mm

        if close:
            close_points.append({
                "point": np.asarray(p, dtype=float).tolist(),
                "s": float(cyl["s"]),
                "theta_deg": float(cyl["theta_deg"]),
                "delta_s": float(ds),
                "delta_theta": float(dtheta),
                "r": float(cyl["r"]),
            })

    collision = direct_hit or len(close_points) > 0

    if direct_hit:
        message = (
            "Risque de contact stent : le point anatomique est directement sur le stent "
            f"ou très proche du stent en 3D patient (distance minimale {direct_distance:.3f} mm, "
            f"seuil {direct_stent_distance_tolerance_mm:.3f} mm)."
        )
    elif close_points:
        best = min(close_points, key=lambda item: item["delta_s"] + item["delta_theta"])
        message = (
            f"Risque de contact stent : {len(close_points)} point(s) du stent proche(s). "
            f"Plus proche : Δs={best['delta_s']:.2f} mm, Δθ={best['delta_theta']:.2f}°."
        )
    else:
        message = (
            "Aucun point de stent détecté dans la zone du trou "
            f"(tolérance ±{longitudinal_tolerance_mm:.1f} mm, ±{angular_tolerance_deg:.1f}°)."
        )

    return {
        "collision": bool(collision),
        "checked": True,
        "message": message,
        "min_delta_s": None if np.isinf(min_delta_s) else float(min_delta_s),
        "min_delta_theta": None if np.isinf(min_delta_theta) else float(min_delta_theta),
        "n_close_points": int(len(close_points)),
        "min_distance_to_stent_mm": direct_distance,
        "direct_point_on_stent": bool(direct_hit),
        "close_points": close_points[:200],
    }


# ============================================================
# GUIDE TEXTUEL
# ============================================================

def build_surgical_guide_text(res: Dict[str, Any]) -> str:
    name = res["name"]
    has_collision = bool(res.get("stent_collision", False))
    checked = bool(res.get("stent_collision_checked", False))

    if not checked:
        stent_status = "NON VÉRIFIÉ : aucun stent chargé. Contrôle manuel nécessaire."
    elif has_collision:
        stent_status = "ATTENTION : risque de contact avec le stent. " + str(res.get("stent_collision_message", ""))
    else:
        stent_status = "OK : aucun contact stent détecté avec les tolérances actuelles."

    if has_collision:
        procedure = (
            "1. Identifier la fenêtre dans le tableau.\n"
            "2. Reporter la position longitudinale sur le pochoir.\n"
            "3. Reporter la position angulaire sur le pochoir.\n"
            "4. Contrôler la zone du stent avant tout perçage.\n"
            "5. Si une maille coupe le centre du trou, appliquer le plus petit décalage compatible avec l'ostium.\n"
            "6. Documenter le décalage final."
        )
    else:
        procedure = (
            "1. Identifier la fenêtre dans le tableau.\n"
            "2. Reporter la position longitudinale sur le pochoir.\n"
            "3. Reporter la position angulaire sur le pochoir.\n"
            "4. Percer au centre du trou sélectionné.\n"
            "5. Vérifier circularité, bavure et cohérence anatomique."
        )

    return (
        "PLANIFICATION DU TROU SUR POCHOIR\n"
        "=================================\n\n"
        f"Fenêtre : {name}\n\n"
        "COORDONNÉES IDÉALES\n"
        "-------------------\n"
        f"s idéal     : {res['s']:.2f} mm\n"
        f"theta idéal : {res['theta_deg']:.2f}° ({res.get('theta_clock', '')})\n\n"
        "TROU DU POCHOIR LE PLUS PROCHE\n"
        "------------------------------\n"
        f"Ligne pochoir : {res['line_num']} ({res['line_s']:.2f} mm)\n"
        f"Trou pochoir  : {res['hole_num']} ({res['hole_theta_deg']:.0f}°)\n\n"
        "ÉCARTS\n"
        "------\n"
        f"Écart hauteur : {res.get('hole_error_height_mm', 0.0):.2f} mm\n"
        f"Écart angle   : {res.get('hole_error_angular_deg', 0.0):.2f}°\n\n"
        "ÉTAT STENT\n"
        "----------\n"
        f"{stent_status}\n\n"
        "PAS À PAS\n"
        "--------\n"
        f"{procedure}\n\n"
        "RAPPEL : ce guide est une aide à la planification. La décision finale reste chirurgicale."
    )


# ============================================================
# PIPELINE PRINCIPAL
# ============================================================

def _normalize_window_points(window_points: Iterable[Union[WindowPoint, Dict[str, Any], Sequence[Any]]]) -> List[WindowPoint]:
    normalized: List[WindowPoint] = []
    for i, item in enumerate(window_points, start=1):
        if isinstance(item, WindowPoint):
            normalized.append(item)
        elif isinstance(item, dict):
            name = str(item.get("name") or f"Fenêtre {i}")
            if "point" in item:
                point = np.asarray(item["point"], dtype=float)
            else:
                point = np.asarray([item["x"], item["y"], item["z"]], dtype=float)
            normalized.append(WindowPoint(name=name, point=point))
        elif isinstance(item, (list, tuple)) and len(item) == 2:
            normalized.append(WindowPoint(name=str(item[0]), point=np.asarray(item[1], dtype=float)))
        else:
            raise ValueError("Format de point non reconnu.")

    if not normalized:
        raise ValueError("Aucun point de fenêtre fourni.")
    return normalized


def run_fevar_planning(
    centerline: Union[np.ndarray, Sequence[Sequence[float]]],
    reference_point: Optional[Sequence[float]],
    window_points: Iterable[Union[WindowPoint, Dict[str, Any], Sequence[Any]]],
    stent_points: Optional[Union[np.ndarray, Sequence[Sequence[float]]]] = None,
    config: Optional[PlanningConfig] = None,
) -> Dict[str, Any]:
    """Fonction principale à appeler depuis un backend FastAPI."""
    cfg = config or PlanningConfig()
    centerline_arr = np.asarray(centerline, dtype=float)
    if centerline_arr.ndim != 2 or centerline_arr.shape[1] != 3:
        raise ValueError("La centerline doit être un tableau (n, 3).")
    if len(centerline_arr) < 3:
        raise ValueError("La centerline doit contenir au moins 3 points.")

    windows = _normalize_window_points(window_points)
    stent_arr = _prepare_stent_points(stent_points, cfg.max_stent_points)

    T, N, B, reference_idx = compute_ptf(centerline_arr, reference_point=reference_point)
    s = compute_curvilinear_abscissa(centerline_arr)
    total_length = float(s[-1])

    results: List[Dict[str, Any]] = []
    for window in windows:
        polar = cartesian_to_local_polar(window.point, centerline_arr, T, N, B, s)
        stencil = map_point_to_stencil(polar["s"], polar["theta_deg"], total_length)
        error = compute_hole_positioning_error(
            polar["s"], polar["theta_deg"], stencil["line_s"], stencil["hole_theta_deg"], STENCIL_RADIUS_MM
        )
        collision = check_hole_stent_collision(
            hole_s=polar["s"],
            hole_theta_deg=polar["theta_deg"],
            stent_points=stent_arr,
            centerline=centerline_arr,
            N=N,
            B=B,
            s=s,
            window_point=window.point,
            longitudinal_tolerance_mm=cfg.longitudinal_tolerance_mm,
            angular_tolerance_deg=cfg.angular_tolerance_deg,
            direct_stent_distance_tolerance_mm=cfg.direct_stent_distance_tolerance_mm,
            radial_tolerance_mm=cfg.radial_tolerance_mm,
            max_stent_points=cfg.max_stent_points,
        )

        result: Dict[str, Any] = {
            "name": window.name,
            "point": np.asarray(window.point, dtype=float).tolist(),
            "s": polar["s"],
            "theta_deg": polar["theta_deg"],
            "theta_rad": polar["theta_rad"],
            "theta_clock": polar["theta_clock"],
            "idx": polar["idx"],
            "distance_to_centerline": polar["distance_to_centerline"],
            "r": polar["r"],
            "local_u": polar["local_u"],
            "local_v": polar["local_v"],
            "line_num": stencil["line_num"],
            "line_idx": stencil["line_idx"],
            "line_s": stencil["line_s"],
            "hole_num": stencil["hole_num"],
            "hole_idx": stencil["hole_idx"],
            "hole_theta_deg": stencil["hole_theta_deg"],
            "hole_theta_clock": stencil["hole_theta_clock"],
            "delta_s": stencil["delta_s"],
            "delta_theta_deg": stencil["delta_theta_deg"],
            "outside_longitudinal_range": stencil["outside_longitudinal_range"],
            "hole_error_height_mm": error["height_error_mm"],
            "hole_error_circumferential_mm": error["circumferential_error_mm"],
            "hole_error_angular_deg": error["angular_error_deg"],
            "hole_error_total_mm": error["total_error_mm"],
            "stent_collision": collision["collision"],
            "stent_collision_checked": collision["checked"],
            "stent_collision_message": collision["message"],
            "stent_collision_n_points": collision["n_close_points"],
            "stent_collision_min_delta_s": collision["min_delta_s"],
            "stent_collision_min_delta_theta": collision["min_delta_theta"],
            "stent_collision_min_distance_3d_mm": collision["min_distance_to_stent_mm"],
            "stent_collision_direct_point_on_stent": collision["direct_point_on_stent"],
        }
        result["guide_text"] = build_surgical_guide_text(result)
        results.append(result)

    return {
        "status": "ok",
        "metadata": {
            "n_centerline_points": int(len(centerline_arr)),
            "n_window_points": int(len(windows)),
            "n_stent_points_checked": int(0 if stent_arr is None else len(stent_arr)),
            "reference_point": None if reference_point is None else [float(x) for x in reference_point],
            "reference_idx": int(reference_idx),
            "reference_s_mm": float(s[reference_idx]),
            "centerline_total_length_mm": total_length,
            "stencil_total_length_mm": float(STENCIL_TOTAL_LENGTH_MM),
            "stencil_line_positions_mm": STENCIL_LINE_POSITIONS_MM.tolist(),
            "stencil_n_holes_circ": int(N_HOLES_CIRC),
            "stencil_n_lines_length": int(N_LINES_LENGTH),
            "config": cfg.__dict__,
        },
        "results": results,
    }


def run_fevar_planning_from_files(
    centerline_path: str,
    reference_point: Optional[Sequence[float]],
    window_points: Iterable[Union[WindowPoint, Dict[str, Any], Sequence[Any]]],
    stent_path: Optional[str] = None,
    config: Optional[PlanningConfig] = None,
) -> Dict[str, Any]:
    centerline, _ = read_centerline_vtk(centerline_path)
    stent_points = read_stent_points(stent_path) if stent_path else None
    return run_fevar_planning(centerline, reference_point, window_points, stent_points, config)


def results_to_json(data: Dict[str, Any], indent: Optional[int] = 2) -> str:
    return json.dumps(data, ensure_ascii=False, indent=indent)


# ============================================================
# MINI CLI POUR TESTER LE MOTEUR SANS FRONTEND
# ============================================================

def main() -> None:
    parser = argparse.ArgumentParser(description="FEVAR core engine - calcul sans interface")
    parser.add_argument("--centerline", required=True, help="Fichier centerline VTK/VTP/VTU")
    parser.add_argument("--stent", default=None, help="Fichier stent VTK/VTP/VTU/STL")
    parser.add_argument("--reference", nargs=3, type=float, default=None, metavar=("X", "Y", "Z"))
    parser.add_argument("--points", required=True, help="JSON : [{'name':'RD','x':1,'y':2,'z':3}]")
    parser.add_argument("--output", default=None, help="Fichier JSON de sortie")
    parser.add_argument("--longitudinal-tolerance", type=float, default=4.0)
    parser.add_argument("--angular-tolerance", type=float, default=12.0)
    parser.add_argument("--direct-stent-tolerance", type=float, default=0.75)
    args = parser.parse_args()

    points = json.loads(args.points)
    cfg = PlanningConfig(
        longitudinal_tolerance_mm=args.longitudinal_tolerance,
        angular_tolerance_deg=args.angular_tolerance,
        direct_stent_distance_tolerance_mm=args.direct_stent_tolerance,
    )
    data = run_fevar_planning_from_files(
        centerline_path=args.centerline,
        stent_path=args.stent,
        reference_point=args.reference,
        window_points=points,
        config=cfg,
    )
    text = results_to_json(data, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text)
    else:
        print(text)


if __name__ == "__main__":
    main()
