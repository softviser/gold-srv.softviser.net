require('dotenv').config({ path: '../.env' });
const http = require('http');
const querystring = require('querystring');

async function testDashboardAccess() {
  console.log('🌐 Dashboard erişim testi başlıyor...\n');
  
  // Session cookie'yi saklayacağız
  let sessionCookie = null;
  
  // 1. Login yaparak session elde et
  console.log('1. Admin login...');
  try {
    const loginData = querystring.stringify({
      email: 'admin@goldserver.com',
      password: 'admin123'
    });
    
    const loginResponse = await makeRequest('POST', '/admin/login', loginData, {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(loginData)
    });
    
    // Session cookie'yi çıkart
    if (loginResponse.headers['set-cookie']) {
      sessionCookie = loginResponse.headers['set-cookie'][0].split(';')[0];
      console.log('✅ Login başarılı, session cookie alındı');
    } else {
      console.log('❌ Session cookie alınamadı');
      return;
    }
    
  } catch (error) {
    console.log('❌ Login hatası:', error.message);
    return;
  }
  
  // 2. Dashboard'a session ile erişim
  console.log('\n2. Dashboard erişimi...');
  try {
    const dashboardResponse = await makeRequest('GET', '/admin', null, {
      'Cookie': sessionCookie
    });
    
    if (dashboardResponse.statusCode === 200) {
      console.log('✅ Dashboard erişimi başarılı');
      console.log(`   İçerik uzunluğu: ${dashboardResponse.body.length} bytes`);
      
      // HTML içeriğini kontrol et
      const body = dashboardResponse.body;
      if (body.includes('Yönetim Paneli') && body.includes('Gold Server')) {
        console.log('✅ Dashboard içeriği doğru yüklendi');
      } else {
        console.log('⚠️ Dashboard içeriği beklenenden farklı');
        console.log('   İlk 200 karakter:', body.substring(0, 200));
      }
    } else {
      console.log(`❌ Dashboard erişim hatası: ${dashboardResponse.statusCode}`);
    }
    
  } catch (error) {
    console.log('❌ Dashboard erişim hatası:', error.message);
  }
  
  // 3. Session olmadan erişim denemesi
  console.log('\n3. Session olmadan dashboard erişimi...');
  try {
    const noSessionResponse = await makeRequest('GET', '/admin');
    
    if (noSessionResponse.statusCode === 302) {
      console.log('✅ Session olmadan doğru şekilde login sayfasına yönlendirildi');
      console.log(`   Redirect URL: ${noSessionResponse.headers.location}`);
    } else {
      console.log(`⚠️ Beklenmeyen durum: ${noSessionResponse.statusCode}`);
    }
    
  } catch (error) {
    console.log('❌ No-session test hatası:', error.message);
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
      console.log(`   ${method} ${path} - Status: ${res.statusCode}`);
      
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
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

testDashboardAccess();