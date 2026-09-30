README - FEVAR Emergency / Application logicielle
===================================================

Projet : FEVAR Emergency - Repérage des fenêtres sur endoprothèse
Architecture : Frontend Lovable + Backend Python FastAPI


1. Objectif du projet
---------------------

Ce projet logiciel a pour objectif d'aider au repérage des fenêtres à réaliser sur une endoprothèse fenêtrée en contexte d'urgence.

L'application permet de transformer des données anatomiques 3D issues d'un export Endosize en instructions simples directement exploitables sur un pochoir physique.

Le principe général est le suivant :

    Export Endosize -> Backend de calcul Python -> Interface Lovable -> Instructions pochoir

Le logiciel convertit des coordonnées cartésiennes 3D :

    (x, y, z)

vers des coordonnées cylindriques exploitables sur le pochoir :

    (s, theta)

avec :

    s     = abscisse curviligne le long de la centerline de l'aorte
    theta = angle autour de l'aorte, exprimé en degrés

Ces informations permettent ensuite d'identifier la ligne et le trou du pochoir à utiliser pour chaque fenêtre.


2. Structure générale du projet
-------------------------------

Le dossier complet du projet est organisé autour de deux parties principales :

    FEVAR_WEB_APP/
    |
    |-- backend/
    |   |-- main.py
    |   |-- fevar_core_engine.py
    |   |-- requirements.txt
    |   |-- uploads/
    |
    |-- frontend/
        |-- projet Lovable / React / TypeScript


2.1 Backend
-----------

Le backend contient le moteur de calcul Python. Il est développé avec FastAPI.

Les fichiers principaux sont :

    main.py
        Définit l'API FastAPI et la route principale /compute.

    fevar_core_engine.py
        Contient le coeur du calcul : lecture des fichiers, traitement de la centerline,
        construction du repère local, conversion des coordonnées et association au pochoir.

    requirements.txt
        Liste les bibliothèques Python nécessaires.

    uploads/
        Dossier utilisé pour stocker temporairement les fichiers importés par l'utilisateur.


2.2 Frontend
------------

Le frontend correspond à l'interface utilisateur développée avec Lovable.

Il permet notamment de :

    - importer les fichiers nécessaires ;
    - lancer le calcul ;
    - afficher les résultats ;
    - visualiser le pochoir ;
    - lire les lignes et trous proposés ;
    - afficher les alertes éventuelles liées au stent ;
    - accompagner l'utilisateur dans le workflow de préparation.

Le frontend communique avec le backend via une requête HTTP vers l'endpoint :

    /compute


3. Données utilisées
--------------------

Le logiciel utilise principalement des fichiers issus d'un export Endosize.

Les fichiers importants sont :

    centerline.vtk
        Fichier contenant la ligne centrale de l'aorte.
        Cette centerline sert de référence pour calculer l'abscisse curviligne s.

    stent.vtk
        Fichier contenant la géométrie du stent.
        Il sert à générer une alerte si une fenêtre tombe trop proche d'une maille métallique.

    points d'intérêt / coordonnées des ostia
        Points anatomiques à fenêtrer, par exemple les ostia rénaux.
        Ces points sont initialement donnés en coordonnées cartésiennes (x, y, z).

D'autres fichiers peuvent être présents dans l'export Endosize, par exemple :

    .stl
    .csv
    .mhd
    .vtk

Tous ne sont pas forcément utilisés directement dans l'application.


4. Fonctionnement du calcul
---------------------------

Le calcul suit les étapes suivantes :

Etape 1 - Import des fichiers
    L'utilisateur importe la centerline, le stent si disponible, et les points anatomiques d'intérêt.

Etape 2 - Lecture de la centerline
    Le backend récupère les points de la centerline de l'aorte.

Etape 3 - Construction d'un repère local
    Le logiciel construit un repère mobile le long de la centerline.
    Ce repère permet de définir une direction locale de l'aorte et de calculer un angle autour de celle-ci.

Etape 4 - Conversion des coordonnées
    Pour chaque point d'intérêt, le logiciel cherche le point de centerline le plus proche.
    Il calcule ensuite :

        s     = distance curviligne le long de la centerline
        theta = angle du point autour de l'aorte

Etape 5 - Association au pochoir
    La coordonnée s est associée à une ligne du pochoir.
    L'angle theta est associé à un trou autour du cylindre.

Etape 6 - Alerte stent
    Si le trou proposé est trop proche de la géométrie du stent, le logiciel génère une alerte.

Etape 7 - Affichage des résultats
    L'interface affiche les résultats sous forme de guide :

        - point anatomique concerné ;
        - valeur de s ;
        - valeur de theta ;
        - ligne du pochoir ;
        - trou du pochoir ;
        - erreur résiduelle éventuelle ;
        - alerte stent éventuelle.


5. Installation du backend
--------------------------

5.1 Se placer dans le dossier backend

Sous Windows PowerShell, aller dans le dossier backend :

    cd "C:\Users\melai\OneDrive\Bureau\FEVAR_WEB_APP\backend"

ou, si le projet est ailleurs :

    cd "chemin\vers\FEVAR_WEB_APP\backend"


5.2 Créer un environnement virtuel Python, optionnel mais recommandé

    python -m venv .venv

Activer l'environnement virtuel :

    .venv\Scripts\activate

Si l'activation est bloquée par PowerShell, lancer :

    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

puis réessayer :

    .venv\Scripts\activate


5.3 Installer les dépendances

Une fois dans le dossier backend, installer les bibliothèques nécessaires :

    pip install -r requirements.txt

Si pip n'est pas reconnu :

    python -m pip install -r requirements.txt


6. Lancer le backend FastAPI
----------------------------

Depuis le dossier backend, lancer le serveur avec Uvicorn :

    python -m uvicorn main:app --reload

Le serveur démarre normalement sur :

    http://127.0.0.1:8000

La documentation interactive de l'API est disponible ici :

    http://127.0.0.1:8000/docs

Cette page permet de tester directement la route /compute en important les fichiers nécessaires.

Important : il faut laisser ce terminal ouvert tant que l'application est utilisée.


7. Exposer le backend avec ngrok
--------------------------------

Lovable étant une application web en ligne, elle ne peut pas toujours accéder directement au backend local situé sur l'ordinateur.

On utilise donc ngrok pour rendre le backend local accessible via une URL publique temporaire.

7.1 Lancer ngrok

Ouvrir un deuxième terminal PowerShell, puis lancer :

    ngrok http 8000

Ngrok génère une URL publique du type :

    https://exemple-ngrok-url.ngrok-free.app

Il faut ensuite utiliser cette URL dans le frontend Lovable, en ajoutant /compute à la fin :

    https://exemple-ngrok-url.ngrok-free.app/compute

Exemple :

    https://celery-snuggle-subject.ngrok-free.dev/compute

Important : si l'URL ngrok n'est pas statique, elle change à chaque redémarrage de ngrok. Il faut donc mettre à jour l'URL dans Lovable à chaque nouvelle session.


8. Configuration de Lovable
---------------------------

Dans Lovable, le frontend doit envoyer les fichiers et les paramètres vers l'URL du backend.

L'URL à utiliser est :

    URL_NGROK + /compute

Par exemple :

    https://exemple-ngrok-url.ngrok-free.app/compute

La requête doit être envoyée en POST avec un FormData contenant les fichiers et paramètres nécessaires.

Les champs attendus par le backend sont notamment :

    centerline_file
        Fichier VTK de centerline.

    stent_file
        Fichier optionnel de stent.

    reference_x
    reference_y
    reference_z
        Coordonnées du point de référence utilisé pour initialiser l'orientation.

    window_points_json
        Liste des points anatomiques à convertir.


9. Lancer le frontend localement, si le projet Lovable a été exporté
--------------------------------------------------------------------

Si le projet Lovable a été exporté ou cloné localement dans un dossier frontend, se placer dans ce dossier :

    cd "chemin\vers\FEVAR_WEB_APP\frontend"

Installer les dépendances :

    npm install

Lancer le serveur de développement :

    npm run dev

Le terminal indiquera ensuite une adresse locale, souvent :

    http://localhost:5173

ou :

    http://localhost:3000

Ouvrir cette adresse dans un navigateur.

Remarque : si l'application est utilisée directement depuis Lovable en ligne, il n'est pas nécessaire de lancer le frontend localement. Il faut seulement vérifier que le backend FastAPI et ngrok sont bien actifs.


10. Ordre de lancement recommandé
---------------------------------

Pour utiliser l'application complète, suivre cet ordre :

1. Ouvrir un terminal dans le dossier backend.

2. Lancer le backend :

       python -m uvicorn main:app --reload

3. Ouvrir un deuxième terminal.

4. Lancer ngrok :

       ngrok http 8000

5. Copier l'URL publique fournie par ngrok.

6. Dans Lovable, vérifier que l'URL appelée est bien :

       https://URL_NGROK/compute

7. Ouvrir l'application Lovable.

8. Importer les fichiers nécessaires.

9. Lancer le calcul.

10. Lire les résultats affichés dans l'interface.


11. Test rapide du backend
--------------------------

Pour vérifier que le backend fonctionne :

1. Lancer le serveur :

       python -m uvicorn main:app --reload

2. Aller dans le navigateur à l'adresse :

       http://127.0.0.1:8000/docs

3. Ouvrir la route POST /compute.

4. Cliquer sur "Try it out".

5. Importer les fichiers demandés.

6. Cliquer sur "Execute".

Si le backend fonctionne correctement, une réponse JSON doit être affichée.


12. Erreurs fréquentes et solutions
-----------------------------------

Erreur : ModuleNotFoundError
    Une bibliothèque Python manque.
    Solution :

        pip install -r requirements.txt

Erreur : port 8000 déjà utilisé
    Un autre serveur utilise déjà le port 8000.
    Solution : fermer l'ancien terminal ou lancer sur un autre port :

        python -m uvicorn main:app --reload --port 8001

    Dans ce cas, il faut aussi lancer ngrok sur le même port :

        ngrok http 8001

Erreur : Lovable ne reçoit pas de réponse
    Causes possibles :

        - le backend n'est pas lancé ;
        - ngrok n'est pas lancé ;
        - l'URL ngrok a changé ;
        - l'URL dans Lovable ne finit pas par /compute ;
        - le backend affiche une erreur dans le terminal.

Erreur CORS
    Si le frontend est bloqué par une erreur CORS, vérifier que main.py autorise bien les requêtes venant de Lovable ou du frontend local.

Erreur fichier non reconnu
    Vérifier que le fichier importé est bien au format attendu, notamment .vtk pour la centerline.

Erreur ngrok
    Si ngrok ne fonctionne pas, vérifier qu'il est bien installé et connecté au compte ngrok si nécessaire.


13. Statut du projet
--------------------

Le projet est actuellement un prototype académique.

Il montre la faisabilité d'une chaîne complète :

    export médical -> calcul géométrique -> interface utilisateur -> instructions pochoir

Il ne s'agit pas d'un dispositif médical validé. Avant toute utilisation réelle, il faudrait :

    - tester le logiciel sur davantage d'exports Endosize ;
    - valider les résultats expérimentalement ;
    - tester l'interface avec des chirurgiens ;
    - fiabiliser les seuils d'alerte liés au stent ;
    - vérifier la conformité réglementaire si l'outil évolue vers un usage clinique.


14. Résumé court pour reprise du projet
---------------------------------------

Pour relancer rapidement le projet :

Terminal 1 :

    cd "C:\Users\melai\OneDrive\Bureau\FEVAR_WEB_APP\backend"
    python -m uvicorn main:app --reload

Terminal 2 :

    ngrok http 8000

Puis dans Lovable :

    mettre l'URL API à jour avec :

    https://URL_NGROK/compute

Ensuite, ouvrir l'application, importer les fichiers et lancer le calcul.
