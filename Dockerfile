FROM mcr.microsoft.com/playwright:v1.55.0-jammy

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies WITHOUT running postinstall
RUN npm install --ignore-scripts

# Copy application files (including TypeScript source)
COPY . .

# Now run the TypeScript build
RUN npm run build

# The browsers are already installed in the Playwright image
# No need to run playwright install

# Use PORT environment variable from Render
ENV PORT=10000
EXPOSE 10000

CMD ["node", "server.js"]