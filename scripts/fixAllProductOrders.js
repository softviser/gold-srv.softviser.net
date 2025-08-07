// scripts/fixAllProductOrders.js
// Tüm ürünlere displayOrder alanı ekleyen script (sectionId null olanlar dahil)

const { MongoClient } = require('mongodb');
require('dotenv').config();

async function fixAllProductOrders() {
    const client = new MongoClient(process.env.MONGODB_URI, {
        auth: {
            username: process.env.MONGODB_USERNAME,
            password: process.env.MONGODB_PASSWORD
        }
    });

    try {
        await client.connect();
        const db = client.db();
        const collection = db.collection('jmon_user_products');

        console.log('📦 Tüm ürün sıralama düzeltme script\'i başlatılıyor...\n');

        // Tüm kullanıcıları al
        const users = await collection.distinct('userId');
        console.log(`👥 Toplam ${users.length} kullanıcı bulundu.\n`);

        let totalUpdated = 0;

        for (const userId of users) {
            console.log(`🔄 Kullanıcı: ${userId} için işleniyor...`);

            // Bu kullanıcının tüm farklı sectionId değerlerini al (null dahil)
            const userSections = await collection.aggregate([
                { $match: { userId: userId } },
                { $group: { _id: '$sectionId' } },
                { $project: { sectionId: '$_id' } }
            ]).toArray();
            
            for (const sectionObj of userSections) {
                const sectionId = sectionObj.sectionId;
                console.log(`  📁 Section: ${sectionId || 'Kategorisiz (null)'}`);

                // Bu section'daki ürünleri al (createdAt'a göre sırala)
                const matchQuery = { userId: userId };
                if (sectionId) {
                    matchQuery.sectionId = sectionId;
                } else {
                    matchQuery.sectionId = null;
                }

                const products = await collection.find(matchQuery)
                    .sort({ createdAt: 1, _id: 1 })
                    .toArray();

                console.log(`    📋 ${products.length} ürün bulundu`);

                // Her ürüne sıra numarası ata
                const updateOperations = [];
                
                products.forEach((product, index) => {
                    const currentOrder = product.displayOrder;
                    const newOrder = index + 1;

                    // Eğer displayOrder yok veya farklıysa güncelle
                    if (currentOrder !== newOrder) {
                        updateOperations.push({
                            updateOne: {
                                filter: { _id: product._id },
                                update: { 
                                    $set: { 
                                        displayOrder: newOrder,
                                        updatedAt: new Date()
                                    }
                                }
                            }
                        });
                        
                        console.log(`      ✏️  ${product.name}: ${currentOrder || 'yok'} → ${newOrder}`);
                    }
                });

                // Batch update yap
                if (updateOperations.length > 0) {
                    const result = await collection.bulkWrite(updateOperations);
                    totalUpdated += result.modifiedCount;
                    console.log(`      ✅ ${result.modifiedCount} ürün güncellendi`);
                } else {
                    console.log(`      ⏭️  Güncellenecek ürün yok`);
                }
            }
            
            console.log(''); // Boş satır
        }

        console.log(`🎉 Script tamamlandı!`);
        console.log(`📊 Toplam ${totalUpdated} ürün güncellendi.`);

        // Sonuç kontrolü
        const totalProducts = await collection.countDocuments();
        const productsWithOrder = await collection.countDocuments({ displayOrder: { $exists: true, $ne: null } });
        
        console.log(`\n📈 Sonuç Raporu:`);
        console.log(`   Toplam ürün: ${totalProducts}`);
        console.log(`   DisplayOrder olan: ${productsWithOrder}`);
        console.log(`   DisplayOrder olmayan: ${totalProducts - productsWithOrder}`);

        if (totalProducts === productsWithOrder) {
            console.log(`✅ Tüm ürünlerde displayOrder alanı mevcut!`);
        } else {
            console.log(`⚠️  ${totalProducts - productsWithOrder} üründe displayOrder alanı eksik.`);
            
            // Eksik olanları göster
            const missingProducts = await collection.find({ 
                $or: [
                    { displayOrder: { $exists: false } },
                    { displayOrder: null }
                ]
            }, { _id: 1, name: 1, userId: 1, sectionId: 1 }).toArray();
            
            console.log('\n❌ DisplayOrder eksik ürünler:');
            missingProducts.forEach(product => {
                console.log(`   - ${product.name} (ID: ${product._id}, User: ${product.userId}, Section: ${product.sectionId || 'null'})`);
            });
        }

    } catch (error) {
        console.error('❌ Hata:', error);
    } finally {
        await client.close();
        console.log('\n🔚 Bağlantı kapatıldı.');
    }
}

// Script'i çalıştır
if (require.main === module) {
    fixAllProductOrders().catch(console.error);
}

module.exports = { fixAllProductOrders };