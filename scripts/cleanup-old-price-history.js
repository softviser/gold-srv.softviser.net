#!/usr/bin/env node

/**
 * Manual cleanup script for price_history records older than 2 years
 * Run this script to remove all price_history records older than 730 days
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const DateHelper = require('../utils/dateHelper');

async function cleanupOldPriceHistory() {
    let mongoClient;
    
    try {
        console.log('🚀 Starting price_history cleanup process...');
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
        const priceHistoryCollection = db.collection('price_history');

        // 2 yıl önceyi hesapla (730 gün)
        const retentionDays = 730; // 2 yıl
        const cutoffDate = DateHelper.createDate();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        
        console.log(`🗓️  Cutoff date: ${DateHelper.formatDateTimeLong(cutoffDate)}`);
        console.log(`📊 Retention period: ${retentionDays} days (2 years)`);

        // Önce kaç kayıt silineceğini say
        const countToDelete = await priceHistoryCollection.countDocuments({
            archivedAt: { $lt: cutoffDate }
        });

        console.log(`📈 Total records in price_history: ${await priceHistoryCollection.countDocuments()}`);
        console.log(`🗑️  Records to be deleted: ${countToDelete}`);

        if (countToDelete === 0) {
            console.log('✅ No old records found. Cleanup not needed.');
            return;
        }

        // Kullanıcıdan onay al
        console.log('\n⚠️  WARNING: This will permanently delete old price history records!');
        console.log('📝 Press Ctrl+C to cancel, or wait 10 seconds to continue...\n');
        
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Eski kayıtları sil
        console.log('🧹 Starting deletion process...');
        const startTime = Date.now();
        
        const result = await priceHistoryCollection.deleteMany({
            archivedAt: { $lt: cutoffDate }
        });

        const endTime = Date.now();
        const duration = endTime - startTime;

        console.log(`✅ Cleanup completed successfully!`);
        console.log(`📊 Records deleted: ${result.deletedCount}`);
        console.log(`⏱️  Duration: ${duration}ms`);
        console.log(`📈 Remaining records: ${await priceHistoryCollection.countDocuments()}`);

        // Cleanup logunu kaydet
        const cleanupLogCollection = db.collection('cleanup_logs');
        await cleanupLogCollection.insertOne({
            timestamp: DateHelper.createDate(),
            type: 'manual_price_history_cleanup',
            deletedCount: result.deletedCount,
            retentionDays: retentionDays,
            cutoffDate: cutoffDate,
            duration: duration,
            success: true,
            metadata: {
                scriptName: 'cleanup-old-price-history.js',
                runBy: 'manual',
                timezone: DateHelper.getCurrentTimezone()
            }
        });

        console.log('📝 Cleanup log saved to cleanup_logs collection');

    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        
        // Hata logunu kaydet
        if (mongoClient) {
            try {
                const db = mongoClient.db();
                const cleanupLogCollection = db.collection('cleanup_logs');
                await cleanupLogCollection.insertOne({
                    timestamp: DateHelper.createDate(),
                    type: 'manual_price_history_cleanup',
                    deletedCount: 0,
                    success: false,
                    error: error.message,
                    metadata: {
                        scriptName: 'cleanup-old-price-history.js',
                        runBy: 'manual',
                        timezone: DateHelper.getCurrentTimezone()
                    }
                });
            } catch (logError) {
                console.error('❌ Failed to save error log:', logError);
            }
        }
        
        process.exit(1);
    } finally {
        if (mongoClient) {
            await mongoClient.close();
            console.log('🔌 MongoDB connection closed');
        }
    }
}

// Ana fonksiyon çalıştır
cleanupOldPriceHistory()
    .then(() => {
        console.log('🎉 Script completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Script failed:', error);
        process.exit(1);
    });