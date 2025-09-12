# 🔄 Configuration de la synchronisation GitHub → Azure DevOps

## 📋 Étapes à suivre

### 1. Créer un Personal Access Token (PAT) sur Azure DevOps

1. Allez sur Azure DevOps : https://dev.azure.com/Simplifi-dentistry
2. Cliquez sur votre avatar en haut à droite → **Personal access tokens**
3. Cliquez sur **+ New Token**
4. Configurez :
   - **Name**: `GitHub Sync`
   - **Organization**: `Simplifi-dentistry`
   - **Expiration**: 90 jours (ou plus)
   - **Scopes**: 
     - ✅ Code (Read & Write)
     - ✅ Build (Read)
5. Cliquez **Create**
6. **COPIEZ LE TOKEN** (vous ne pourrez plus le voir après)

### 2. Ajouter le token à GitHub

1. Allez sur votre repo GitHub : https://github.com/fred1433/dental-portal-extractor
2. **Settings** → **Secrets and variables** → **Actions**
3. Cliquez **New repository secret**
4. Configurez :
   - **Name**: `AZURE_DEVOPS_PAT`
   - **Secret**: [Collez le token Azure DevOps]
5. Cliquez **Add secret**

### 3. Activer GitHub Actions

Dans votre repo GitHub :
1. Allez dans l'onglet **Actions**
2. Si demandé, cliquez **Enable Actions**

### 4. Tester la synchronisation

Commitez et poussez les changements :
```bash
git add .github/workflows/azure-sync.yml AZURE-SETUP.md
git commit -m "🔄 Add Azure DevOps sync workflow"
git push
```

### 5. Vérifier le résultat

1. **Sur GitHub** : 
   - Onglet **Actions** → Vérifiez que le workflow s'exécute
   
2. **Sur Azure DevOps** :
   - https://dev.azure.com/Simplifi-dentistry/AI-Powered-Scrapping/_git/AI-Powered-Scrapping
   - Vérifiez le dossier `scrapers/dental-portal/`

## 🔧 Structure dans Azure DevOps

Votre code sera organisé ainsi :
```
AI-Powered-Scrapping/
├── scrapers/
│   ├── dnoa/          (existant)
│   ├── metlife/       (existant) 
│   ├── dentaquest/    (existant)
│   ├── aetna/         (existant)
│   └── dental-portal/ (NOUVEAU - tout votre projet)
│       ├── cigna-service.js
│       ├── dnoa-service.js
│       ├── metlife-service.js
│       ├── dentaquest-service.js
│       ├── server.js
│       ├── monitor.js
│       └── ...
└── README.md
```

## 🚀 Fonctionnement automatique

Après configuration :
- **Chaque `git push`** sur GitHub déclenche automatiquement la sync
- Le code est copié dans `scrapers/dental-portal/` sur Azure
- Les fichiers sensibles (.env, sessions) sont exclus
- Le README est mis à jour avec le statut actuel

## ⚠️ Important

- Les sessions et .env ne sont PAS synchronisés (sécurité)
- La sync est unidirectionnelle : GitHub → Azure
- Le workflow s'exécute en ~30 secondes

## 🔍 Dépannage

Si la sync échoue :
1. Vérifiez que le PAT Azure n'a pas expiré
2. Vérifiez les permissions du PAT
3. Regardez les logs dans GitHub Actions

## 📞 Support

Contact : fredric.de@dentistryautomation.com