# 🔒 Notes de Sécurité - Dental Portal Extractor

## ⚠️ IMPORTANT: Ne jamais exécuter monitor.js localement

### Pourquoi ?
L'exécution locale de `monitor.js` peut **invalider les sessions de production** car :
- Les portails détectent les changements d'IP (local vs serveur Render)
- Le fingerprinting du navigateur peut détecter un environnement différent
- Les cookies de session peuvent être liés à une machine spécifique
- MetLife et DentaQuest ont des mécanismes anti-fraude stricts

### Comment tester le monitoring ?

#### ✅ Méthode recommandée (Production)
```bash
# Interface web
https://dental-portal-extractor.onrender.com/monitor?key=demo2024secure

# API
curl "https://dental-portal-extractor.onrender.com/api/monitor/test?key=demo2024secure"
```

#### ❌ À éviter
```bash
node monitor.js  # BLOQUÉ par sécurité
```

#### ⚠️ Bypass d'urgence uniquement
```bash
ALLOW_LOCAL_MONITOR=true node monitor.js  # DANGEREUX - peut casser les sessions prod
```

### Sessions persistantes
Les sessions sont stockées dans :
- `.metlife-session/` - Session MetLife
- `.dentaquest-session/` - Session DentaQuest  
- `.dnoa-session/` - Session DNOA

**Ne jamais partager ces dossiers entre environnements !**

### Règles d'or
1. **Tester uniquement en production** via l'URL Render
2. **Ne jamais copier les sessions** entre local et prod
3. **Utiliser des comptes séparés** pour dev si nécessaire
4. **Monitorer via l'interface web** plutôt que la ligne de commande

---
*Dernière mise à jour : 11/09/2025*