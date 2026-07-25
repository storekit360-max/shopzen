'use strict';

const { Settings } = require('../models/index');
const { buildInvoicePdf } = require('./invoicePdf');
const {
  sendMail,
  orderDeliveredCustomerHtml,
  isEmailEnabled,
} = require('../utils/mailer');

async function sendDeliveredBill(order, note) {
  const deliveredHtml = await orderDeliveredCustomerHtml(order, note);
  const settingRows = await Settings.find({ key: { $in: ['storeName','storeTagline','storeEmail','storePhone','storeAddress','logoUrl','primaryColor'] } }).lean();
  const invoiceSettings = Object.fromEntries(settingRows.map(row => [row.key, row.value]));
  const invoicePdf = await buildInvoicePdf(order, invoiceSettings);
  const safeInvoiceNumber = String(order.orderNumber || order._id).replace(/[^a-zA-Z0-9_-]/g, '-');
  return sendMail({
    to: order.billing.email,
    subject: `Delivered — Invoice for ${order.orderNumber} | ShopZen`,
    html: deliveredHtml,
    text: `Hi ${order.billing.firstName || 'Customer'},\n\nYour order ${order.orderNumber} has been delivered and paid.\n\nThank you for shopping with ShopZen.`,
    attachments: [{ filename: `ShopZen-Invoice-${safeInvoiceNumber}.pdf`, content: invoicePdf, contentType: 'application/pdf' }],
  });
}

async function finalizeDeliveredOrder(order, note = 'Order delivered') {
  if (order.paymentStatus === 'pending') {
    order.paymentStatus = 'paid';
    order.statusHistory.push({ status: 'delivered', note: 'Payment automatically marked as paid on delivery', updatedBy: 'system' });
    await order.save();
  }

  if (!order.billing?.email || !(await isEmailEnabled('order_delivered_bill_customer'))) return;
  const claimed = await order.constructor.findOneAndUpdate(
    { _id: order._id, deliveredBillEmailStatus: { $nin: ['sending', 'sent'] } },
    { $set: { deliveredBillEmailStatus: 'sending', deliveredBillEmailError: '' } },
    { new: true }
  );
  if (!claimed) return;
  try {
    const data = await sendDeliveredBill(order, note);
    await order.constructor.findByIdAndUpdate(order._id, {
      deliveredBillEmailStatus: 'sent', deliveredBillEmailSentAt: new Date(),
      deliveredBillEmailProviderId: data?.id || '', deliveredBillEmailError: '',
    });
  } catch (error) {
    await order.constructor.findByIdAndUpdate(order._id, {
      deliveredBillEmailStatus: 'failed',
      deliveredBillEmailError: String(error.message || 'Email delivery failed').slice(0, 500),
    });
    console.error('[DELIVERED BILL EMAIL]', error.message);
  }
}

module.exports = { finalizeDeliveredOrder };
