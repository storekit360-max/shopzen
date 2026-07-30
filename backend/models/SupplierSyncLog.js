const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  supplierProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'SupplierProduct' },
  triggerSource: { type: String, enum: ['manual','scheduler','mapping_test','discovery','checkout_recheck'], default: 'manual' },
  previousStock: Number, supplierAvailability: String, supplierReportedStock: Number,
  calculatedStock: Number, updatedStock: Number, detectionMethod: String,
  syncStatus: String, httpStatus: Number, errorCategory: String, errorMessage: String, durationMs: Number,
}, { timestamps: true });
schema.index({ supplier: 1, createdAt: -1 });
module.exports = mongoose.models.SupplierSyncLog || mongoose.model('SupplierSyncLog', schema);
