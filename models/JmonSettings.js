const { ObjectId } = require('mongodb');
const DateHelper = require('../utils/dateHelper');

class JmonSettings {
  constructor(db) {
    this.collection = db.collection('jmon_settings');
    
    // Index oluştur
    this.collection.createIndex({ userId: 1, settingKey: 1 }, { unique: true });
    this.collection.createIndex({ userId: 1, category: 1 });
    this.collection.createIndex({ userId: 1, isActive: 1 });
  }

  // Get all settings for a user as a single object
  async getUserSettings(userId, category = null) {
    const query = { 
      userId: ObjectId.isValid(userId) ? new ObjectId(userId) : userId,
      isActive: true 
    };
    if (category) {
      query.category = category;
    }
    
    const settings = await this.collection.find(query).toArray();
    const result = {};
    
    settings.forEach(setting => {
      if (!result[setting.category]) {
        result[setting.category] = {};
      }
      result[setting.category][setting.settingKey] = setting.settingValue;
    });
    
    return result;
  }

  // Get all settings for a user with full details including description and isActive
  async getUserSettingsDetailed(userId, category = null) {
    const query = { 
      userId: ObjectId.isValid(userId) ? new ObjectId(userId) : userId
    };
    if (category) {
      query.category = category;
    }
    
    const settings = await this.collection.find(query).toArray();
    const result = {};
    
    settings.forEach(setting => {
      if (!result[setting.category]) {
        result[setting.category] = {};
      }
      result[setting.category][setting.settingKey] = {
        value: setting.settingValue,
        description: setting.description || null,
        isActive: setting.isActive,
        //updatedAt: setting.updatedAt,
        //createdAt: setting.createdAt
      };
    });
    
    return result;
  }

  // Update or create a setting
  async upsertSetting(userId, settingKey, settingValue, category = 'general', description = null) {
    const userObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;
    
    const result = await this.collection.findOneAndUpdate(
      { userId: userObjectId, settingKey },
      {
        $set: {
          settingValue,
          category,
          description,
          isActive: true,
          updatedAt: DateHelper.getNow()
        },
        $setOnInsert: {
          createdAt: DateHelper.getNow()
        }
      },
      {
        returnDocument: 'after',
        upsert: true
      }
    );
    
    return result.value;
  }

  // Bulk update settings
  async bulkUpdateSettings(userId, settings) {
    const userObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;
    const operations = [];
    
    for (const [category, categorySettings] of Object.entries(settings)) {
      for (const [key, value] of Object.entries(categorySettings)) {
        operations.push({
          updateOne: {
            filter: { userId: userObjectId, settingKey: key },
            update: {
              $set: {
                settingValue: value,
                category: category,
                isActive: true,
                updatedAt: DateHelper.getNow()
              },
              $setOnInsert: {
                createdAt: DateHelper.getNow()
              }
            },
            upsert: true
          }
        });
      }
    }
    
    if (operations.length > 0) {
      return await this.collection.bulkWrite(operations);
    }
    
    return null;
  }

  // Find one setting
  async findOne(query) {
    if (query.userId && ObjectId.isValid(query.userId)) {
      query.userId = new ObjectId(query.userId);
    }
    return await this.collection.findOne(query);
  }

  // Update one setting
  async findOneAndUpdate(filter, update, options = {}) {
    if (filter.userId && ObjectId.isValid(filter.userId)) {
      filter.userId = new ObjectId(filter.userId);
    }
    
    // Add timestamp to update
    if (!update.$set) update.$set = {};
    update.$set.updatedAt = DateHelper.getNow();
    
    const result = await this.collection.findOneAndUpdate(filter, update, {
      ...options,
      returnDocument: options.new ? 'after' : 'before'
    });
    
    return result.value;
  }

  // Update many settings
  async updateMany(filter, update) {
    if (filter.userId && ObjectId.isValid(filter.userId)) {
      filter.userId = new ObjectId(filter.userId);
    }
    
    // Add timestamp to update
    if (!update.$set) update.$set = {};
    update.$set.updatedAt = DateHelper.getNow();
    
    return await this.collection.updateMany(filter, update);
  }

  // Get distinct values
  async distinct(field, filter) {
    if (filter.userId && ObjectId.isValid(filter.userId)) {
      filter.userId = new ObjectId(filter.userId);
    }
    return await this.collection.distinct(field, filter);
  }
}

module.exports = JmonSettings;