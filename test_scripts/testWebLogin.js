require('dotenv').config({ path: '../.env' });
const https = require('https');
const http = require('http');
const querystring = require('querystring');

async function testWebLogin() {
  console.log('🌐 Web login testi başlıyor...\n');
  
  // Login sayfasına GET isteği
  console.log('1. Login sayfasına erişim testi:');
  try {
    await makeRequest('GET', '/admin/login');
  } catch (error) {
    console.log('❌ Login sayfası erişim hatası:', error.message);
    return;
  }
  
  console.log('\n2. Admin login POST testi:');
  try {
    const postData = querystring.stringify({
      email: 'admin@goldserver.com',
      password: 'admin123'
    });
    
    await makeRequest('POST', '/admin/login', postData, {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    });
  } catch (error) {
    console.log('❌ Admin login POST hatası:', error.message);
  }
  
  console.log('\n3. Yanlış şifre testi:');
  try {
    const postData = querystring.stringify({
      email: 'admin@goldserver.com',
      password: 'yanlis123'
    });
    
    await makeRequest('POST', '/admin/login', postData, {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    });
  } catch (error) {
    console.log('❌ Yanlış şifre testi hatası:', error.message);
  }
}

function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 6701,
      path: path,
      method: method,
      headers: {
        'User-Agent': 'Test-Client/1.0',
        ...headers
      }
    };
    
    const req = http.request(options, (res) => {
      console.log(`✅ ${method} ${path} - Status: ${res.statusCode}`);
      console.log(`   Headers: ${JSON.stringify(res.headers, null, 2)}`);
      
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 302) {
          console.log(`   Redirect to: ${res.headers.location}`);
        }
        
        if (body.length < 500) {
          console.log(`   Body (ilk 500 karakter): ${body.substring(0, 500)}`);
        } else {
          console.log(`   Body length: ${body.length} bytes`);
        }
        
        resolve(body);
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (data) {
      req.write(data);
    }
    
    req.end();
  });
}

testWebLogin();