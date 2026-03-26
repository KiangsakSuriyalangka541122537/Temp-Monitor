const https = require('https');

https.get('https://cdn.jsdelivr.net/gh/googlefonts/sarabun@master/fonts/ttf/Sarabun-Regular.ttf', (res) => {
  console.log('Status:', res.statusCode);
}).on('error', (e) => {
  console.error(e);
});
