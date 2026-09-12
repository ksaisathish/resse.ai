/**
 * UPI payment QR generation for appointment deposits.
 *
 * Deliberately simple: builds a standard `upi://pay` deep link (the same URI
 * scheme GPay/PhonePe/Paytm/BHIM all register for) and renders it as a QR
 * code server-side, so the mobile app just displays an image — no QR/SVG
 * library needed on the client.
 *
 * There is NO automatic payment verification here. UPI doesn't give a
 * third-party app a way to observe someone else's bank SMS or account
 * balance without a payment-gateway integration (Razorpay/Cashfree/PhonePe
 * Business, etc.) — out of scope for "keep it simple." A human confirms
 * payment was received before the booking is finalized (see
 * apps/mobile/src/tools.tsx's book_appointment tool).
 */
import QRCode from "qrcode";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    upiId?: unknown;
    payeeName?: unknown;
    amount?: unknown;
    note?: unknown;
  };

  const upiId = typeof body.upiId === "string" ? body.upiId.trim() : "";
  const payeeName = typeof body.payeeName === "string" ? body.payeeName.trim() : "Business";
  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
  const note = typeof body.note === "string" ? body.note.trim() : "Booking deposit";

  if (!upiId) {
    return Response.json({ error: "A `upiId` string is required." }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return Response.json({ error: "A positive numeric `amount` is required." }, { status: 400 });
  }

  const upiLink =
    `upi://pay?pa=${encodeURIComponent(upiId)}` +
    `&pn=${encodeURIComponent(payeeName)}` +
    `&am=${encodeURIComponent(amount.toFixed(2))}` +
    `&cu=INR` +
    `&tn=${encodeURIComponent(note)}`;

  const qrDataUrl = await QRCode.toDataURL(upiLink, { margin: 1, width: 400 });

  return Response.json({ upiLink, qrDataUrl });
}
