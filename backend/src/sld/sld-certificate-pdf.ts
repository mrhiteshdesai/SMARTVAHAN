import * as fs from 'fs';
import * as path from 'path';
import * as PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';

export type SldCertificatePdfData = {
  certificateNumber: string;
  kind?: string;
  vehicleNumber: string;
  registrationRto?: string;
  series?: string;
  ownerName?: string;
  ownerContact?: string;
  vehicleMake?: string;
  vehicleModelName?: string;
  chassisNumber?: string;
  engineNumber?: string;
  manufacturingYear?: string;
  passingRto?: string;
  locationText?: string;
  dealerName?: string;
  tradeCertificateNo?: string;
  gstNo?: string;
  tradeValidity?: string;
  aadharNumber?: string;
  companyName?: string;
  deviceModelName?: string;
  deviceModelCode?: string;
  deviceSerialNumber?: string;
  sealNumber?: string;
  tacNumber?: string;
  copNumber?: string;
  testingAgency?: string;
  speedLimit?: string;
  verifyUrl?: string;
  generatedAt?: Date | string;
  validFrom?: Date | string;
  validTo?: Date | string;
  photos?: {
    photoPlate?: string | null;
    photoInstalled?: string | null;
    photoSeal?: string | null;
    photoSerial?: string | null;
  };
};

function formatDateGb(d: Date | string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB');
}

function dash(v: any) {
  const s = v == null ? '' : String(v).trim();
  return s || '—';
}

/**
 * Render SmartVahan SLD Fitment Testing Certificate (A4).
 * Layout matches admin-approved mockup: badge + reg + title + QR, sub-header,
 * letter, vehicle/SLD details, photos, Reflective-style dealer footer + Note.
 */
export async function renderSldCertificatePdf(
  outputPath: string,
  data: SldCertificatePdfData,
): Promise<string> {
  const verifyUrl = String(data.verifyUrl || '').trim() || 'https://smartvahan.net/verify-sld';
  let qrBuffer: Buffer | null = null;
  try {
    qrBuffer = await QRCode.toBuffer(verifyUrl, {
      type: 'png',
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 220,
    });
  } catch {
    qrBuffer = null;
  }

  await new Promise<void>((resolve, reject) => {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const doc = new PDFDocument({ size: 'A4', margin: 28 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const startX = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    let currentY = doc.page.margins.top;

    const drawGreyHeader = (text: string, y: number) => {
      doc.rect(startX, y, contentWidth, 18).fill('#E0E0E0');
      doc
        .fillColor('black')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(text, startX, y + 4, { align: 'center', width: contentWidth });
      return y + 22;
    };

    const drawField = (label: string, value: string, x: number, y: number, w: number) => {
      const labelW = w * 0.42;
      const colonX = x + labelW;
      const valueX = colonX + 10;
      const valueW = w - labelW - 10;
      const labelText = label.toUpperCase();
      const val = dash(value).toUpperCase();

      doc.fillColor('black').font('Helvetica').fontSize(8).text(labelText, x, y, {
        width: labelW,
        align: 'left',
      });
      doc.text(':', colonX, y, { width: 10, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(8).text(val, valueX, y, {
        width: valueW,
        align: 'left',
      });

      doc.font('Helvetica').fontSize(8);
      const labelH = doc.heightOfString(labelText, { width: labelW });
      doc.font('Helvetica-Bold').fontSize(8);
      const valueH = doc.heightOfString(val, { width: valueW });
      return Math.max(14, labelH, valueH);
    };

    const isRenewal = String(data.kind || '').toUpperCase() === 'RENEWAL';
    const badgeText = isRenewal ? 'RECALIBRATION' : 'NEW FITMENT';
    const certTitle = isRenewal
      ? 'SLD Recalibration & Testing Certificate'
      : 'SLD Fitment Testing Certificate';
    const regDisplay = (
      `${String(data.registrationRto || '').trim()}${String(data.series || '').trim()}` ||
      String(data.vehicleNumber || '').trim()
    ).toUpperCase();

    const generatedAtStr = formatDateGb(data.generatedAt);
    const validToStr = formatDateGb(data.validTo);
    const oemName = dash(data.companyName);
    const deviceModel = dash(data.deviceModelCode || data.deviceModelName);
    const sealNo = dash(data.sealNumber);
    const setSpeed = dash(data.speedLimit);

    // ================= HEADER =================
    // Equal left/right side columns so reg/title/content are centered on the page.
    const sideW = 90;
    const qrSize = 78;
    const centerX = startX + sideW;
    const centerW = contentWidth - sideW * 2;
    const headerTop = currentY;
    const headerH = 96;
    const rightColX = startX + contentWidth - sideW;

    // Left badge column (same width as QR column)
    doc.rect(startX, headerTop, sideW, headerH).fill('#E8E8E8');
    doc.save();
    doc.fillColor('#111');
    doc.translate(startX + sideW / 2, headerTop + headerH / 2);
    doc.rotate(-90);
    doc.font('Helvetica-Bold').fontSize(10).text(badgeText, -headerH / 2 + 4, -6, {
      width: headerH - 8,
      align: 'center',
    });
    doc.restore();

    // Center title block — page-centered between equal side columns
    let ty = headerTop + 8;
    doc
      .fillColor('black')
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(regDisplay || '—', centerX, ty, { width: centerW, align: 'center' });
    ty = doc.y + 4;
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(certTitle, centerX, ty, {
        width: centerW,
        align: 'center',
      });
    ty = doc.y + 4;
    doc
      .font('Helvetica')
      .fontSize(8)
      .text('(VALID FOR ONE YEAR ONLY)', centerX, ty, { width: centerW, align: 'center' });
    ty = doc.y + 3;
    doc
      .font('Helvetica')
      .fontSize(7)
      .text(
        'THIS CERTIFICATE IS ONLY ISSUED AFTER FITTING, TESTING & SEALING THE DEVICE ON THE VEHICLE',
        centerX,
        ty,
        { width: centerW, align: 'center' },
      );

    // Right QR column (same width as badge)
    const qrX = rightColX + (sideW - qrSize) / 2;
    const qrY = headerTop + 4;
    if (qrBuffer) {
      try {
        doc.image(qrBuffer, qrX, qrY, { fit: [qrSize, qrSize] });
      } catch {
        doc.rect(qrX, qrY, qrSize, qrSize).stroke();
      }
    } else {
      doc.rect(qrX, qrY, qrSize, qrSize).stroke();
      doc.font('Helvetica').fontSize(8).text('QR', qrX, qrY + 32, {
        width: qrSize,
        align: 'center',
      });
    }
    doc
      .font('Helvetica-Oblique')
      .fontSize(7)
      .text('(Scan to Verify)', rightColX, qrY + qrSize + 2, {
        width: sideW,
        align: 'center',
      });

    currentY = headerTop + headerH + 6;

    // ================= SUB HEADER =================
    doc.rect(startX, currentY, contentWidth, 18).fill('#E0E0E0');
    doc.fillColor('black').font('Helvetica-Bold').fontSize(8);
    doc.text(
      `CERTIFICATE NUMBER : ${dash(data.certificateNumber).toUpperCase()}`,
      startX + 6,
      currentY + 5,
      { width: contentWidth * 0.58, align: 'left' },
    );
    doc.text(`DATE OF GENERATION : ${generatedAtStr}`, startX + contentWidth * 0.55, currentY + 5, {
      width: contentWidth * 0.45 - 6,
      align: 'right',
    });
    currentY += 24;

    // ================= LETTER =================
    doc.font('Helvetica-Bold').fontSize(9).text('To,', startX, currentY);
    currentY = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).text('RTO / ARTO / ATS', startX, currentY);
    currentY = doc.y + 6;

    const letterParts: Array<{ text: string; bold?: boolean }> = [
      { text: 'This is to certify that the vehicle described below has been fitted with an approved ' },
      { text: oemName, bold: true },
      { text: ' Speed Limiting Device, Model ' },
      { text: deviceModel, bold: true },
      { text: ', bearing Seal No. ' },
      { text: sealNo, bold: true },
      { text: '. The device has been tested on ' },
      { text: generatedAtStr, bold: true },
      { text: " and is programmed to limit the vehicle's maximum speed to " },
      { text: `${setSpeed} Kmph`, bold: true },
      {
        text: '. The device is designed to prevent the vehicle from exceeding the prescribed speed unless it is tampered with or the seal is broken by an unauthorized person. This certificate is valid until ',
      },
      { text: validToStr, bold: true },
      { text: '.' },
    ];

    // Build justified paragraph with mixed bold via continued text
    doc.font('Helvetica').fontSize(8);
    let first = true;
    for (const part of letterParts) {
      doc.font(part.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      if (first) {
        doc.text(part.text, startX, currentY, {
          width: contentWidth,
          align: 'justify',
          continued: true,
        });
        first = false;
      } else {
        doc.text(part.text, { continued: true });
      }
    }
    doc.text('', { continued: false });
    currentY = doc.y + 8;

    // ================= VEHICLE DETAILS =================
    currentY = drawGreyHeader('VEHICLE DETAILS', currentY);
    const vColW = contentWidth / 2;
    const rightX = startX + vColW;
    const vLeft: Array<[string, string]> = [
      ['VEHICLE MAKE', dash(data.vehicleMake)],
      ['REGISTRATION NO.', dash(data.vehicleNumber)],
      ['CHASSIS NUMBER', dash(data.chassisNumber)],
      ['OWNER NAME', dash(data.ownerName)],
    ];
    const vRight: Array<[string, string]> = [
      ['MODEL', dash(data.vehicleModelName)],
      ['MANUFACTURING YEAR', dash(data.manufacturingYear)],
      ['ENGINE NUMBER', dash(data.engineNumber)],
      ['OWNER CONTACT NO.', dash(data.ownerContact)],
    ];
    let rowY = currentY;
    for (let i = 0; i < vLeft.length; i++) {
      const hL = drawField(vLeft[i][0], vLeft[i][1], startX, rowY, vColW);
      const hR = drawField(vRight[i][0], vRight[i][1], rightX, rowY, vColW);
      rowY += Math.max(hL, hR);
    }
    currentY = rowY + 6;

    // ================= SLD DETAILS =================
    currentY = drawGreyHeader('SLD DETAILS', currentY);
    const sLeft: Array<[string, string]> = [
      ['OEM', oemName],
      ['SERIAL NUMBER', dash(data.deviceSerialNumber)],
      ['TESTING AGENCY', dash(data.testingAgency)],
      ['COP', dash(data.copNumber)],
      ['INSTALLED BY', dash(data.dealerName)],
    ];
    const sRight: Array<[string, string]> = [
      ['MODEL', deviceModel],
      ['SEAL NUMBER', sealNo],
      ['TAC', dash(data.tacNumber)],
      ['SET SPEED LIMIT (KM/H)', setSpeed],
      ['LOCATION', dash(String(data.locationText || '').slice(0, 90))],
    ];
    rowY = currentY;
    for (let i = 0; i < sLeft.length; i++) {
      const hL = drawField(sLeft[i][0], sLeft[i][1], startX, rowY, vColW);
      const hR = drawField(sRight[i][0], sRight[i][1], rightX, rowY, vColW);
      rowY += Math.max(hL, hR);
    }
    currentY = rowY + 6;

    // ================= FITMENT PHOTOGRAPHS =================
    // Ensure room; if tight, new page
    const photoGap = 8;
    const photoW = (contentWidth - photoGap * 3) / 4;
    const photoH = 88;
    const photosBlockH = 18 + 12 + photoH + 8;
    if (currentY + photosBlockH > doc.page.height - doc.page.margins.bottom - 120) {
      doc.addPage();
      currentY = doc.page.margins.top;
    }

    currentY = drawGreyHeader('FITMENT PHOTOGRAPHS', currentY);
    const photoLabels = [
      'Vehicle Number Plate',
      'Device Fitment',
      'Seal',
      'Document',
    ];
    const photoFiles = [
      data.photos?.photoPlate,
      data.photos?.photoInstalled,
      data.photos?.photoSeal,
      data.photos?.photoSerial,
    ];

    for (let i = 0; i < 4; i++) {
      const px = startX + i * (photoW + photoGap);
      doc
        .font('Helvetica-Oblique')
        .fontSize(7)
        .fillColor('black')
        .text(photoLabels[i], px, currentY, { width: photoW, align: 'center' });
      const imgY = currentY + 11;
      try {
        if (photoFiles[i] && fs.existsSync(photoFiles[i]!)) {
          doc.image(photoFiles[i]!, px, imgY, {
            fit: [photoW, photoH],
            align: 'center',
            valign: 'center',
          });
        } else {
          doc.rect(px, imgY, photoW, photoH).stroke('#999');
        }
      } catch {
        doc.rect(px, imgY, photoW, photoH).stroke('#999');
      }
    }
    currentY += 11 + photoH + 10;

    // ================= DEALER DETAILS (same pattern as Reflective QR) =================
    if (currentY + 90 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      currentY = doc.page.margins.top;
    }

    currentY = drawGreyHeader('DEALER DETAILS', currentY);
    const dealerName = dash(data.dealerName);
    const tradeCert = data.tradeCertificateNo ? String(data.tradeCertificateNo).trim() : 'NA';
    const gstNo = data.gstNo ? String(data.gstNo).trim() : 'NA';
    const tradeValidity = data.tradeValidity ? String(data.tradeValidity).trim() : 'NA';
    const aadharNo = data.aadharNumber ? String(data.aadharNumber).trim() : 'NA';

    let leftY = currentY;
    leftY += drawField('DEALER NAME', dealerName, startX, leftY, vColW);

    if (tradeCert !== 'NA' && tradeCert !== '—') {
      leftY += drawField('TRADE CERTIFICATE', tradeCert, startX, leftY, vColW);
      if (tradeValidity !== 'NA' && tradeValidity !== '—') {
        leftY += drawField('TRADE VALIDITY', tradeValidity, startX, leftY, vColW);
      }
    }
    if (gstNo !== 'NA' && gstNo !== '—') {
      leftY += drawField('GSTIN', gstNo, startX, leftY, vColW);
    }
    if (aadharNo && aadharNo !== 'NA' && aadharNo !== '—') {
      leftY += drawField('AADHAR NUMBER', aadharNo, startX, leftY, vColW);
    }

    const rtoLocation = dash(data.passingRto);
    drawField('RTO/ATS LOCATION', rtoLocation, rightX, currentY, vColW);
    currentY = Math.max(leftY, currentY + 14) + 8;

    // ================= NOTE =================
    doc.font('Helvetica-Bold').fontSize(9).text('NOTE:', startX, currentY);
    currentY = doc.y + 3;
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .text(
        'THIS CERTIFICATE IS ONLY ISSUED AFTER FITTING, TESTING & SEALING THE DEVICE ON THE VEHICLE',
        startX,
        currentY,
        { width: contentWidth * 0.68 },
      );
    currentY = doc.y + 3;
    doc
      .font('Helvetica')
      .fontSize(7)
      .text(
        'We undertake not to raise any dispute or any legal claims against us if the above-mentioned seals at found broken/torn/tampered and more specifically with the respect to any variance in the speed limit set at the time of delivery',
        startX,
        currentY,
        { width: contentWidth * 0.68, align: 'justify' },
      );

    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('(DEALER STAMP & SIGN)', startX + contentWidth - 150, currentY + 18, {
        width: 150,
        align: 'center',
      });

    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  return outputPath;
}
