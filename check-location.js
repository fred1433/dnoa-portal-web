// Check if running on Render or locally
async function checkLocation() {
  const isRender = process.env.RENDER === 'true' || process.env.RENDER_SERVICE_NAME;
  
  if (isRender) {
    console.log('🚀 Running on Render platform');
    return 'render';
  } else {
    console.log('💻 Running locally');
    return 'local';
  }
}

module.exports = checkLocation;