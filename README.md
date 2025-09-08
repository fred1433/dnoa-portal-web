# DNOA Portal Web Interface

Web interface for extracting patient eligibility and benefits data from DNOA portal.

## 🚀 Deployment on Render

### Quick Deploy

1. Push this folder to a GitHub repository
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Create a new **Web Service**
4. Connect your GitHub repository
5. Configure:
   - **Root Directory**: `portal-web`
   - **Build Command**: `npm install && npx playwright install chromium`
   - **Start Command**: `node server.js`
   - **Environment**: Node

### Environment Variables (Required)

Set these in Render dashboard:

```
DNOA_USERNAME=payorportalsdbmail
DNOA_PASSWORD=payoraccess1
API_KEY=your-secure-key-here
PORT=10000
```

### Important Notes

- The service uses persistent browser sessions stored in `.dnoa-session/`
- First run will require login, subsequent runs use saved session
- Session persists for 30-90 days typically

## 📊 API Usage

Access the interface at: `https://your-app.onrender.com/?key=your-secure-key-here`

### Test Patient Data
- First Name: SOPHIE
- Last Name: ROBINSON
- Subscriber ID: 825978894
- Date of Birth: 09/27/2016

## 🔒 Security

- API key required for all requests
- Credentials stored in environment variables
- No PHI stored permanently

## 📝 Local Development

```bash
npm install
npx playwright install chromium
node server.js
```

Access at: http://localhost:3000/?key=demo2024