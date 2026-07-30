const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  websiteUrl: { type: String, required: true, trim: true },
  normalizedDomain: { type: String, required: true, index: true },
  integrationType: { type: String, enum: ['website'], default: 'website' },
  platform: { type: String, enum: ['WooCommerce','Shopify','Magento','Custom','Unknown'], default: 'Unknown' },
  isActive: { type: Boolean, default: true },
  syncEnabled: { type: Boolean, default: false },
  syncIntervalMinutes: { type: Number, min: 5, max: 10080, default: 15 },
  defaultInStockQuantity: { type: Number, min: 0, default: 2 },
  safetyStock: { type: Number, min: 0, default: 1 },
  maximumSellableStock: { type: Number, min: 0, default: null },
  requestTimeoutMs: { type: Number, min: 1000, max: 60000, default: 15000 },
  browserFallbackEnabled: { type: Boolean, default: true },
  connectionStatus: { type: String, enum: ['Not tested','Testing','Connected','Limited','Failed'], default: 'Not tested' },
  connectionMessage: { type: String, default: '' },
  sitemapUrls: { type: [String], default: [] },
  productUrlPatterns: { type: [String], default: [] },
  detectedCapabilities: { type: mongoose.Schema.Types.Mixed, default: {} },
  discoveredProductCount: { type: Number, default: 0 },
  mappedProductCount: { type: Number, default: 0 },
  lastConnectionTestAt: Date, lastDiscoveryAt: Date, lastSyncAt: Date,
  lastSuccessfulSyncAt: Date, lastFailedSyncAt: Date,
  lastSyncStatus: { type: String, enum: ['success','partial','failed',''], default: '' },
  lastSyncError: { type: String, default: '' }, nextSyncAt: Date,
}, { timestamps: true });

module.exports = mongoose.models.Supplier || mongoose.model('Supplier', supplierSchema);
