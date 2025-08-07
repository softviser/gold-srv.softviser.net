const LoggerHelper = require('../utils/logger');

class FormulaCalculator {
  constructor() {
    // Supported operators and functions
    this.operators = ['+', '-', '*', '/', '(', ')', '^'];
    this.functions = ['sqrt', 'pow', 'abs', 'round', 'floor', 'ceil', 'min', 'max'];
    
    // Price variable patterns - Support both HAS_alis and HAS/TRY_buying formats
    this.priceVariablePattern = /([A-Z]+(?:\/[A-Z]+)?)_(alis|satis|buying|selling|last|avg)/g;
    this.symbolPattern = /^[A-Z]{2,4}\/[A-Z]{2,4}$/;
    this.currencyCodePattern = /^[A-Z]{2,4}$/;
  }

  /**
   * Formülü hesaplar
   * @param {string} formula - Hesaplanacak formül (örn: "HAS_alis * 0.995")
   * @param {object} priceData - Fiyat verileri
   * @param {object} roundingConfig - Yuvarlama konfigürasyonu (opsiyonel)
   * @returns {object} - {value, usedPrices, variables, roundedValue}
   */
  calculate(formula, priceData, roundingConfig = null) {
    try {
      if (!formula || typeof formula !== 'string') {
        throw new Error('Geçersiz formül');
      }

      if (!priceData || typeof priceData !== 'object') {
        throw new Error('Fiyat verileri bulunamadı');
      }

      // Formüldeki değişkenleri tespit et
      const variables = this.extractVariables(formula);
      const usedPrices = {};

      // Değişkenleri fiyat değerleriyle değiştir
      let processedFormula = formula;
      
      for (const variable of variables) {
        const priceValue = this.getPriceValue(variable, priceData);
        
        if (priceValue === null || priceValue === undefined) {
          throw new Error(`${variable.symbol} için ${variable.priceType} fiyatı bulunamadı`);
        }

        usedPrices[variable.variable] = priceValue;
        
        // Formülde değişkeni sayısal değerle değiştir
        const regex = new RegExp(this.escapeRegex(variable.variable), 'g');
        processedFormula = processedFormula.replace(regex, priceValue.toString());
      }

      // Formülü güvenli şekilde hesapla
      const result = this.evaluateFormula(processedFormula);

      // Sonuç kontrolü
      if (isNaN(result) || !isFinite(result)) {
        throw new Error('Hesaplama sonucu geçersiz');
      }

      // Yuvarlama uygula
      let roundedValue = result;
      if (roundingConfig) {
        roundedValue = this.roundValue(result, roundingConfig);
      }

      return {
        value: result,
        roundedValue: roundedValue,
        usedPrices: usedPrices,
        variables: variables,
        processedFormula: processedFormula,
        roundingConfig: roundingConfig
      };

    } catch (error) {
      LoggerHelper.error('Formula calculation error:', error);
      throw new Error(`Formül hesaplama hatası: ${error.message}`);
    }
  }

  /**
   * Formüldeki değişkenleri çıkarır
   * @param {string} formula - Formül
   * @returns {array} - Değişken listesi
   */
  extractVariables(formula) {
    const variables = [];
    const matches = formula.matchAll(this.priceVariablePattern);

    for (const match of matches) {
      const symbolOrCode = match[1]; // HAS/TRY veya HAS
      const originalPriceType = match[2]; // alis, satis, buying, selling
      
      // Price type'ı normalize et
      let priceType = originalPriceType;
      if (originalPriceType === 'alis') {
        priceType = 'buying';
      } else if (originalPriceType === 'satis') {
        priceType = 'selling';
      }
      
      // Variable ve symbol'ü belirle
      const variable = `${symbolOrCode}_${originalPriceType}`;
      let symbol;
      
      // Eğer zaten symbol formatındaysa (HAS/TRY) direkt kullan
      if (symbolOrCode.includes('/')) {
        symbol = symbolOrCode;
      } else {
        // Değilse TRY ekle (HAS -> HAS/TRY)
        symbol = `${symbolOrCode}/TRY`;
      }

      // Tekrar eden değişkenleri ekleme
      if (!variables.find(v => v.variable === variable)) {
        variables.push({
          symbol: symbol,
          priceType: priceType,
          variable: variable,
          originalPriceType: originalPriceType
        });
      }
    }

    return variables;
  }

  /**
   * Fiyat verisinden belirli bir değişkenin değerini alır
   * @param {object} variable - Değişken bilgisi
   * @param {object} priceData - Fiyat verileri
   * @returns {number|null} - Fiyat değeri
   */
  getPriceValue(variable, priceData) {
    try {
      const { symbol, priceType, variable: varName } = variable;

      // Önce direkt variable adıyla kontrol et (HAS/TRY_buying)
      if (priceData[varName] !== undefined && priceData[varName] !== null) {
        return priceData[varName];
      }

      // Sonra symbol bazlı kontrol et
      if (priceData[symbol]) {
        const symbolData = priceData[symbol];

        switch (priceType) {
          case 'buying':
            return symbolData.buying || symbolData.bid || null;
          
          case 'selling':
            return symbolData.selling || symbolData.ask || null;
          
          case 'last':
            return symbolData.last || symbolData.selling || null;
            
          default:
            return null;
        }
      }

      return null;

    } catch (error) {
      LoggerHelper.error('Get price value error:', error);
      return null;
    }
  }

  /**
   * Formülü güvenli şekilde hesaplar
   * @param {string} formula - İşlenmiş formül
   * @returns {number} - Hesaplama sonucu
   */
  evaluateFormula(formula) {
    try {
      // Güvenlik kontrolü - sadece izin verilen karakterler (** power operator dahil)
      const allowedPattern = /^[0-9+\-*/^.() \s]+$/;
      if (!allowedPattern.test(formula)) {
        throw new Error('Formül güvenli olmayan karakterler içeriyor');
      }

      // JavaScript Math objesi ile güvenli hesaplama
      const sanitizedFormula = formula
        .replace(/\^/g, '**') // ^ operatörünü ** ile değiştir
        .replace(/\s+/g, ''); // Boşlukları temizle

      // Function kullanımı için güvenli eval alternatifi
      return Function('"use strict"; return (' + sanitizedFormula + ')')();

    } catch (error) {
      throw new Error(`Formül hesaplama hatası: ${error.message}`);
    }
  }

  /**
   * Formülü doğrular
   * @param {string} formula - Doğrulanacak formül
   * @param {string} baseSymbol - Ana sembol (opsiyonel)
   * @returns {object} - Doğrulama sonucu
   */
  validateFormula(formula, baseSymbol = null) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      variables: [],
      complexity: 'simple'
    };

    try {
      if (!formula || typeof formula !== 'string') {
        result.isValid = false;
        result.errors.push('Formül boş olamaz');
        return result;
      }

      // Formülü temizle
      formula = formula.trim();

      // Değişkenleri çıkar
      const variables = this.extractVariables(formula);
      result.variables = variables;

      if (variables.length === 0) {
        result.isValid = false;
        result.errors.push('Formülde geçerli fiyat değişkeni bulunamadı');
        return result;
      }

      // Ana sembol kontrolü
      if (baseSymbol) {
        const hasBaseSymbol = variables.some(v => v.symbol === baseSymbol);
        if (!hasBaseSymbol) {
          result.warnings.push(`Formül ana sembol (${baseSymbol}) içermiyor`);
        }
      }

      // Sembol formatı kontrolü
      for (const variable of variables) {
        if (!this.symbolPattern.test(variable.symbol)) {
          result.errors.push(`Geçersiz sembol formatı: ${variable.symbol}`);
          result.isValid = false;
        }
      }

      // Parantez dengesi kontrolü
      const openParens = (formula.match(/\(/g) || []).length;
      const closeParens = (formula.match(/\)/g) || []).length;
      
      if (openParens !== closeParens) {
        result.errors.push('Parantez dengesi hatalı');
        result.isValid = false;
      }

      // Operatör kontrolü (** power operatörü hariç)
      const consecutiveOps = /(?!\*\*)[+\-*/]{2,}/g;
      if (consecutiveOps.test(formula)) {
        result.errors.push('Ardışık operatörler kullanılamaz');
        result.isValid = false;
      }

      // Karmaşıklık analizi
      if (variables.length > 5) {
        result.complexity = 'complex';
        result.warnings.push('Formül çok sayıda değişken içeriyor');
      } else if (variables.length > 2) {
        result.complexity = 'medium';
      }

      // Güvenlik kontrolü
      const dangerousPatterns = [
        /eval\s*\(/i,
        /function\s*\(/i,
        /window\./i,
        /document\./i,
        /process\./i,
        /__proto__/i,
        /constructor/i
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(formula)) {
          result.errors.push('Formül güvenli olmayan ifadeler içeriyor');
          result.isValid = false;
          break;
        }
      }

      // Test hesaplama
      try {
        const testPrices = this.generateTestPrices(variables);
        this.calculate(formula, testPrices);
      } catch (testError) {
        result.errors.push(`Test hesaplama başarısız: ${testError.message}`);
        result.isValid = false;
      }

    } catch (error) {
      result.isValid = false;
      result.errors.push(`Doğrulama hatası: ${error.message}`);
    }

    return result;
  }

  /**
   * Test için örnek fiyat verileri üretir
   * @param {array} variables - Değişken listesi
   * @returns {object} - Test fiyat verileri
   */
  generateTestPrices(variables) {
    const testPrices = {};

    for (const variable of variables) {
      const symbol = variable.symbol;
      
      if (!testPrices[symbol]) {
        // Test değerleri üret
        const basePrice = Math.random() * 100 + 10; // 10-110 arası
        
        testPrices[symbol] = {
          buying: basePrice - 0.1,
          selling: basePrice + 0.1,
          last: basePrice,
          bid: basePrice - 0.1,
          ask: basePrice + 0.1,
          close: basePrice,
          price: basePrice
        };
      }
    }

    return testPrices;
  }

  /**
   * Değeri yuvarlar
   * @param {number} value - Yuvarlanacak değer
   * @param {object} roundingConfig - Yuvarlama konfigürasyonu
   * @returns {number} - Yuvarlanmış değer
   */
  roundValue(value, roundingConfig = {}) {
    try {
      if (value === null || value === undefined || isNaN(value)) {
        return value;
      }

      const {
        method = 'none', // 'none', 'up', 'down', 'nearest'
        precision = 0,    // 0 (yuvarlama yok), 1, 5, 10, 25, 50, 100
        decimalPlaces = 2 // Ondalık basamak sayısı
      } = roundingConfig;

      // Yuvarlama yok
      if (method === 'none' || precision === 0) {
        return Number(value.toFixed(decimalPlaces));
      }

      let roundedValue;

      switch (method) {
        case 'up':
          roundedValue = Math.ceil(value / precision) * precision;
          break;
        case 'down':
          roundedValue = Math.floor(value / precision) * precision;
          break;
        case 'nearest':
        default:
          roundedValue = Math.round(value / precision) * precision;
          break;
      }

      return Number(roundedValue.toFixed(decimalPlaces));

    } catch (error) {
      LoggerHelper.error('Round value error:', error);
      return value;
    }
  }

  /**
   * Değeri formatlar
   * @param {number} value - Formatlanacak değer
   * @param {object} config - Format konfigürasyonu
   * @returns {string} - Formatlanmış değer
   */
  formatValue(value, config = {}) {
    try {
      if (value === null || value === undefined || isNaN(value)) {
        return 'N/A';
      }

      const {
        decimalPlaces = 2,
        prefix = '',
        suffix = '',
        thousandSeparator = true,
        showSign = false,
        rounding = null // Yuvarlama konfigürasyonu
      } = config;

      // Önce yuvarlama uygula
      let processedValue = value;
      if (rounding) {
        processedValue = this.roundValue(value, rounding);
      }

      // Ondalık basamak sayısını uygula
      let formattedValue = Number(processedValue).toFixed(decimalPlaces);

      // Binlik ayırıcı
      if (thousandSeparator) {
        const parts = formattedValue.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        formattedValue = parts.join('.');
      }

      // İşaret
      if (showSign && processedValue > 0) {
        formattedValue = '+' + formattedValue;
      }

      // Prefix ve suffix
      return prefix + formattedValue + suffix;

    } catch (error) {
      LoggerHelper.error('Format value error:', error);
      return value.toString();
    }
  }

  /**
   * Regex için string'i escape eder
   * @param {string} string - Escape edilecek string
   * @returns {string} - Escape edilmiş string
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Formül örnekleri döndürür
   * @returns {array} - Örnek formüller
   */
  getFormulaExamples() {
    return [
      {
        name: '22 Ayar Altın Alış',
        formula: 'HAS_alis * 0.916',
        description: 'Has altın alış fiyatının %91.6\'sı (22 ayar)',
        category: 'gold'
      },
      {
        name: '18 Ayar Altın Satış',
        formula: 'HAS_satis * 0.750',
        description: 'Has altın satış fiyatının %75\'i (18 ayar)',
        category: 'gold'
      },
      {
        name: 'Döviz Ortalaması',
        formula: '(USD_alis + USD_satis) / 2',
        description: 'USD alış ve satış fiyatlarının ortalaması',
        category: 'currency'
      },
      {
        name: 'Altın Gram (Komisyonlu)',
        formula: 'HAS_alis * 0.995 - 5',
        description: 'Has altın alış fiyatı, %0.5 komisyon ve 5 TL sabit ücret',
        category: 'gold'
      },
      {
        name: 'Çeyrek Altın Satış',
        formula: 'HAS_satis * 1.75',
        description: 'Has altın satış fiyatının 1.75 katı (çeyrek altın)',
        category: 'gold'
      },
      {
        name: 'Euro-Dolar Çarpımı',
        formula: 'USD_alis * EUR_satis',
        description: 'USD alış ve EUR satış fiyatlarının çarpımı',
        category: 'currency'
      }
    ];
  }

  /**
   * Desteklenen sembolleri döndürür
   * @returns {array} - Sembol listesi
   */
  getSupportedSymbols() {
    return [
      { symbol: 'HAS/TRY', name: 'Has Altın', type: 'gold' },
      { symbol: 'USD/TRY', name: 'Amerikan Doları', type: 'currency' },
      { symbol: 'EUR/TRY', name: 'Euro', type: 'currency' },
      { symbol: 'GBP/TRY', name: 'İngiliz Sterlini', type: 'currency' },
      { symbol: 'XAU/USD', name: 'Altın/Dolar', type: 'gold' },
      { symbol: 'XAG/USD', name: 'Gümüş/Dolar', type: 'precious' },
      { symbol: 'XPT/USD', name: 'Platin/Dolar', type: 'precious' }
    ];
  }

  /**
   * Desteklenen fiyat tiplerini döndürür
   * @returns {array} - Fiyat tipi listesi
   */
  getSupportedPriceTypes() {
    return [
      { type: 'alis', name: 'Alış', description: 'Alış fiyatı (buying/bid)' },
      { type: 'satis', name: 'Satış', description: 'Satış fiyatı (selling/ask)' }
    ];
  }
}

module.exports = FormulaCalculator;