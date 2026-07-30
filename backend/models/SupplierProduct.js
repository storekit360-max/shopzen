const mongoose = require('mongoose');
const supplierProductSchema = new mongoose.Schema({
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
  productUrl: { type: String, required: true }, normalizedUrl: { type: String, required: true },
  productName: String, normalizedName: String, brand: String, sku: String, mpn: String,
  gtin: String, modelNumber: String, price: Number, currency: String,
  availability: { type: String, enum: ['in_stock','out_of_stock','unknown','unavailable'], default: 'unknown' },
  exactStockQuantity: { type: Number, default: null }, variants: { type: [mongoose.Schema.Types.Mixed], default: [] },
  imageUrl: String, detectionMethod: String,
  extractionStatus: { type: String, enum: ['success','partial','failed'], default: 'failed' },
  lastCheckedAt: Date, lastSuccessfulCheckAt: Date, lastError: String,
  identityFingerprint: String, isActive: { type: Boolean, default: true },
}, { timestamps: true });
supplierProductSchema.index({ supplier: 1, normalizedUrl: 1 }, { unique: true });
module.exports = mongoose.models.SupplierProduct || mongoose.model('SupplierProduct', supplierProductSchema);
