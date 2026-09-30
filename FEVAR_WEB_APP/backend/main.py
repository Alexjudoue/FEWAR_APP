# -*- coding: utf-8 -*-
"""
Created on Sat Jun 13 19:25:11 2026

@author: melai
"""

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import json
import tempfile
import os

from fevar_core_engine import run_fevar_planning_from_files

app = FastAPI(title="FEVAR Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # à sécuriser plus tard
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health_check():
    return {"status": "ok", "message": "FEVAR backend is running"}


@app.post("/compute")
async def compute_fevar(
    centerline_file: UploadFile = File(...),
    stent_file: UploadFile | None = File(None),
    reference_x: float | None = Form(None),
    reference_y: float | None = Form(None),
    reference_z: float | None = Form(None),
    window_points_json: str = Form(...)
):
    """
    Reçoit :
    - centerline VTK/VTP/VTU
    - stent optionnel
    - point de référence theta = 0 optionnel
    - liste des points fenêtres en JSON

    Retourne :
    - résultats PTF
    - s, theta
    - ligne/trou du pochoir
    - alertes stent
    - guide opératoire
    """

    with tempfile.TemporaryDirectory() as tmpdir:
        centerline_path = os.path.join(tmpdir, centerline_file.filename)

        with open(centerline_path, "wb") as f:
            f.write(await centerline_file.read())

        stent_path = None
        if stent_file is not None:
            stent_path = os.path.join(tmpdir, stent_file.filename)
            with open(stent_path, "wb") as f:
                f.write(await stent_file.read())

        if reference_x is not None and reference_y is not None and reference_z is not None:
            reference_point = [reference_x, reference_y, reference_z]
        else:
            reference_point = None

        window_points = json.loads(window_points_json)

        result = run_fevar_planning_from_files(
            centerline_path=centerline_path,
            stent_path=stent_path,
            reference_point=reference_point,
            window_points=window_points,
        )

        return result