#!/usr/bin/env node

/**
 * Set price history retention to 2 years (730 days)
 * This script updates the priceHistoryRetentionDays setting to 730 days
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const DateHelper = require('../utils/dateHelper');

async function setRetentionTo2Years() {
    let mongoClient;
    
    try {
        console.log('🚀 Setting price history retention to 2 years...');
        console.log(`📅 Current time: ${DateHelper.formatDateTimeLong(DateHelper.createDate())}`);
        
        // MongoDB bağlantısı
        const mongoUri = process.env.MONGODB_URI;
        const mongoOptions = {
            auth: {
                username: process.env.MONGODB_USERNAME,
                password: process.env.MONGODB_PASSWORD
            }
        };

        mongoClient = new MongoClient(mongoUri, mongoOptions);
        await mongoClient.connect();
        console.log('✅ MongoDB connection established');

        const db = mongoClient.db();

        // Settings servisini başlat
        const settingsService = require('../utils/settingsService');
        await settingsService.initialize(db);
        console.log('⚙️  Settings service initialized');

        // Mevcut ayarları kontrol et
        const currentRetention = settingsService.getPriceHistoryRetentionDays();
        console.log(`📊 Current retention: ${currentRetention} days`);

        // 2 yıl = 730 gün olarak ayarla
        const newRetention = 730;
        await settingsService.set('data.priceHistoryRetentionDays', newRetention, 'data', 'Fiyat geçmişi saklama süresi (gün) - price_history tablosundaki kayıtlar bu süre sonunda silinir');
        
        console.log(`✅ Updated retention to: ${newRetention} days (2 years)`);

        // Cache'i yenile
        await settingsService.refreshCache();
        console.log('🔄 Settings cache refreshed');

        // Doğrula
        const updatedRetention = settingsService.getPriceHistoryRetentionDays();
        console.log(`✅ Verified new retention: ${updatedRetention} days`);

        if (updatedRetention === newRetention) {
            console.log('🎉 Successfully updated price history retention to 2 years!');
        } else {
            console.log('❌ Warning: Verification failed!');
        }

        // Settings durumunu göster
        console.log('\n📊 Current Data Settings:');
        console.log(`   - API fiyat görüntüleme süresi: ${settingsService.getPriceHistoryDays()} days`);
        console.log(`   - Fiyat geçmişi saklama süresi: ${settingsService.getPriceHistoryRetentionDays()} days`);
        console.log(`   - Bağlantı logları saklama süresi: ${settingsService.getConnectionLogDays()} days`);
        console.log(`   - Log saklama süresi: ${settingsService.getLogRetentionDays()} days`);

    } catch (error) {
        console.error('❌ Error during retention update:', error);
        process.exit(1);
    } finally {
        if (mongoClient) {
            await mongoClient.close();
            console.log('🔌 MongoDB connection closed');
        }
    }
}

// Ana fonksiyon çalıştır
setRetentionTo2Years()
    .then(() => {
        console.log('🎉 Retention update completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Retention update failed:', error);
        process.exit(1);
    });