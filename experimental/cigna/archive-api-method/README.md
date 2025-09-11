# 🏆 CIGNA SCRAPER - 100% API

**Le scraper dental le plus avancé et rapide !**

## 🎯 CARACTÉRISTIQUES

✅ **100% API** - Pas de HTML scraping  
✅ **GraphQL complet** - Toutes données en 1 call  
✅ **Ultra rapide** - ~3 secondes par patient  
✅ **Données complètes** - Patient + Claims + Procedures + Payment  
✅ **Bearer token** - Authentification sécurisée  

## 📁 FICHIERS PRINCIPAUX

| Fichier | Usage | Description |
|---------|-------|-------------|
| `cigna-final.js` | 🚀 **PRODUCTION** | Scraper principal avec classe CignaExtractor |
| `data/` | 💾 **RÉSULTATS** | Fichiers JSON extraits |
| `archive/` | 📦 **ARCHIVE** | Scripts de développement et tests |

## 🚀 USAGE RAPIDE

```javascript
// Import
const { CignaExtractor } = require('./cigna-final');

// Créer extractor avec Bearer token
const extractor = new CignaExtractor("ton_bearer_token");

// Extraire un patient par claim ID
const data = await extractor.extractPatientByClaimId(
  "claimNumber",
  "claimCompositeKey", 
  "compositeClaimId",
  "tinNumber"
);

// Sauvegarder
await extractor.saveResults(data);
```

## 🔑 OBTENIR BEARER TOKEN

1. **Connecte-toi** à https://cignaforhcp.cigna.com
2. **F12** → Network tab
3. **Rafraîchis** la page
4. **Trouve** une requête `apollo-graphql`
5. **Copie** le `authorization: Bearer ...`

## 📊 DONNÉES EXTRAITES

**Patient complet :**
- Info patient (nom, DOB, member ID, relation)
- Claims summary (montants, dates, provider, status)
- Procedures détaillées (codes, dents, montants)
- Totaux calculés (charged, allowed, deductible)
- Payment info (payee, check, EFT)
- Remark codes expliqués
- Correspondence history
- Reconsideration history

## 🆚 COMPARAISON PORTAILS

| Portal | Méthode | Vitesse | Complétude | Fiabilité |
|--------|---------|---------|------------|-----------|
| **🏆 Cigna** | **100% API** | **⚡ 3s** | **🌟 Parfait** | **💎 Excellent** |
| DentaQuest | HTML Scraping | ~30s | Moyen | Moyen |
| DNOA | API Limitée | ~10s | Basique | Bon |

## ⚠️ NOTES

- Token expire en ~1h
- Claims Search API a parfois des erreurs 500
- GraphQL Direct fonctionne toujours parfaitement
- Utilise les données claim connues pour éviter la search

---

**🎉 Cigna = Champion absolu pour extraction dental data !**