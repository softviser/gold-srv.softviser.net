#!/usr/bin/env node

/**
 * Manual cleanup runner - executes both cleanup services immediately
 * This script will run the cleanup service and price archive service manually
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const DateHelper = require('../utils/dateHelper');

async function runManualCleanup() {
    let mongoClient;
    
    try {
        console.log('🚀 Starting manual cleanup process...');
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

        // CleanupService'i başlat ve çalıştır
        console.log('\n📊 Starting CleanupService...');
        const CleanupService = require('../services/CleanupService');
        const cleanupService = new CleanupService(db);
        
        await cleanupService.runDailyCleanup();
        console.log('✅ CleanupService manual run completed');

        // PriceArchiveService'i başlat ve çalıştır
        console.log('\n📈 Starting PriceArchiveService...');
        const PriceArchiveService = require('../services/PriceArchiveService');
        const priceArchiveService = new PriceArchiveService(db);
        
        await priceArchiveService.archiveCurrentPrices();
        console.log('✅ PriceArchiveService manual run completed');

        // İstatistikleri göster
        console.log('\n📊 Service Statistics:');
        
        const cleanupStats = await cleanupService.getCleanupStats(7);
        console.log('🧹 Cleanup Service (last 7 days):');
        console.log(`   - Total runs: ${cleanupStats.totalRuns}`);
        console.log(`   - Successful runs: ${cleanupStats.successfulRuns}`);
        console.log(`   - Total deleted: ${cleanupStats.totalDeleted}`);
        console.log(`   - Success rate: ${cleanupStats.successRate.toFixed(1)}%`);
        
        const archiveStats = await priceArchiveService.getArchiveStats(7);
        console.log('📈 Price Archive Service (last 7 days):');
        console.log(`   - Total runs: ${archiveStats.totalRuns}`);
        console.log(`   - Successful runs: ${archiveStats.successfulRuns}`);
        console.log(`   - Total archived: ${archiveStats.totalArchived}`);
        console.log(`   - Success rate: ${archiveStats.successRate.toFixed(1)}%`);

        // Service durum bilgileri
        console.log('\n⚙️  Service Status:');
        const cleanupStatus = cleanupService.getServiceStatus();
        const archiveStatus = priceArchiveService.getServiceStatus();
        
        console.log('🧹 Cleanup Service:');
        console.log(`   - Schedule active: ${cleanupStatus.scheduleActive}`);
        console.log(`   - Next cleanup: ${cleanupStatus.nextCleanup}`);
        console.log(`   - Retention days: ${cleanupStatus.settings.priceHistoryRetentionDays}`);
        
        console.log('📈 Price Archive Service:');
        console.log(`   - Schedule active: ${archiveStatus.scheduleActive}`);
        console.log(`   - Next archive: ${archiveStatus.nextArchiveWindow}`);
        console.log(`   - Retention days: ${archiveStatus.settings.archiveRetentionDays}`);

    } catch (error) {
        console.error('❌ Error during manual cleanup:', error);
        process.exit(1);
    } finally {
        if (mongoClient) {
            await mongoClient.close();
            console.log('🔌 MongoDB connection closed');
        }
    }
}

// Ana fonksiyon çalıştır
runManualCleanup()
    .then(() => {
        console.log('🎉 Manual cleanup completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Manual cleanup failed:', error);
        process.exit(1);
    });