import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Header,
  VerticalAlign,
  TableLayoutType,
  UnderlineType,
  ImageRun,
  SectionType,
} from 'docx';
import { readSheet } from 'read-excel-file/browser';
import writeXlsxFile, { type SheetData } from 'write-excel-file/browser';
import PptxGenJS from 'pptxgenjs';
import { SchoolIdentity, UserProfile, PptSlideSpec, ProsemEvaluationEntry, TextbookRecord } from '../types/education';
import { formatJpDuration } from './jpStandards';

export interface PrintableTwoColumnQuestion {
  number: number;
  stem: string;
  points?: number;
  options?: string[];
}

export interface PrintableSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  twoColumnQuestions?: PrintableTwoColumnQuestion[];
  table?: {
    headers: string[];
    rows: (string | number)[][];
  };
}

export interface PrintableDocPayload {
  title: string;
  subtitle?: string;
  fileName: string;
  school?: SchoolIdentity | null;
  teacher?: UserProfile | null;
  metadataPairs?: { label: string; value: string }[];
  sections: PrintableSection[];
  includeSignatures?: boolean;
  showTitiMangsa?: boolean;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatDocDateId() {
  return new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function resolveTitiMangsa(
  school?: SchoolIdentity | null,
  customOverride?: string
): string {
  const custom = (customOverride ?? school?.titiMangsa ?? '').trim();
  if (custom) return custom;
  const regency = (school?.regency || '').trim();
  return `${regency || '......................'}, .......................... 20....`;
}

function decodeDataUrlBytes(dataUrl?: string): { bytes: Uint8Array; type: 'png' | 'jpg' } | null {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;
  try {
    const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(dataUrl);
    if (!match) return null;
    const raw = atob(match[2]);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i);
    }
    return { bytes, type: match[1].toLowerCase() === 'png' ? 'png' : 'jpg' };
  } catch {
    return null;
  }
}

function drawPdfLetterhead(
  doc: jsPDF,
  school: SchoolIdentity | null | undefined,
  pageWidth: number,
  margin: number,
  topY = 13
): number | null {
  const dataUrl = school?.letterheadDataUrl;
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;
  try {
    const props = doc.getImageProperties(dataUrl);
    if (!props.width || !props.height) return null;
    const maxW = pageWidth - margin * 2;
    const maxH = 34;
    const ratio = props.height / props.width;
    let drawW = maxW;
    let drawH = drawW * ratio;
    if (drawH > maxH) {
      drawH = maxH;
      drawW = drawH / ratio;
    }
    const drawX = margin + (maxW - drawW) / 2;
    const imgFormat = props.fileType === 'PNG' ? 'PNG' : 'JPEG';
    doc.addImage(dataUrl, imgFormat, drawX, topY, drawW, drawH);
    return topY + drawH + 4.5;
  } catch {
    return null;
  }
}

function getDataUrlDimensions(dataUrl: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      resolve(w > 0 && h > 0 ? { width: w, height: h } : null);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function buildDocxLetterheadParagraph(
  school: SchoolIdentity | null | undefined
): Promise<Paragraph | null> {
  const img = decodeDataUrlBytes(school?.letterheadDataUrl);
  if (!img || !school?.letterheadDataUrl) return null;
  const dims = await getDataUrlDimensions(school.letterheadDataUrl);
  const maxW = 620;
  const maxH = 135;
  let drawW = maxW;
  let drawH = 110;
  if (dims) {
    const ratio = dims.height / dims.width;
    drawW = maxW;
    drawH = drawW * ratio;
    if (drawH > maxH) {
      drawH = maxH;
      drawW = drawH / ratio;
    }
  }
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [
      new ImageRun({
        data: img.bytes,
        transformation: { width: Math.round(drawW), height: Math.round(drawH) },
        type: img.type,
      }),
    ],
  });
}

export function exportDocumentPdf(payload: PrintableDocPayload) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  let y = 17;

  const schoolName = payload.school?.name || 'Satuan Pendidikan';
  const schoolAddr = [
    payload.school?.address,
    payload.school?.district,
    payload.school?.regency,
    payload.school?.province,
  ]
    .filter(Boolean)
    .join(', ');
  const runningHeader = `${schoolName}${payload.subtitle ? ` | ${payload.subtitle}` : ''}`;

  // Running header kanan atas
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(runningHeader, pageWidth - margin, 10, { align: 'right' });

  // Kop / Header Dokumen Resmi
  const customKopY = drawPdfLetterhead(doc, payload.school, pageWidth, margin, 13);
  if (customKopY !== null) {
    y = customKopY;
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0, 51, 128);
    doc.text(schoolName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
    y += 4.8;

    if (schoolAddr) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(schoolAddr, pageWidth / 2, y, { align: 'center' });
      y += 4.2;
    }
  }

  // Judul Dokumen
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(payload.title.toUpperCase(), pageWidth - margin * 2);
  doc.text(titleLines, pageWidth / 2, y, { align: 'center' });
  y += titleLines.length * 4.8;

  if (payload.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    doc.text(payload.subtitle, pageWidth / 2, y, { align: 'center' });
    y += 4.5;
  }

  // Double divider line
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineWidth(0.2);
  doc.line(margin, y + 1, pageWidth - margin, y + 1);
  y += 6.5;

  // Tabel Identitas
  if (payload.metadataPairs && payload.metadataPairs.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 1.2, textColor: [15, 23, 42] },
      columnStyles: {
        0: { cellWidth: 44, fontStyle: 'bold' },
        1: { cellWidth: 4 },
      },
      body: payload.metadataPairs.map((m) => [m.label, ':', m.value || '-']),
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 22) {
      doc.addPage();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(runningHeader, pageWidth - margin, 10, { align: 'right' });
      y = 17;
    }
  };

  for (const sec of payload.sections) {
    ensureSpace(16);
    // Section banner dengan aksen kiri navy
    doc.setFillColor(238, 244, 251);
    doc.setDrawColor(191, 219, 254);
    doc.rect(margin, y - 4, pageWidth - margin * 2, 6.8, 'FD');
    doc.setFillColor(30, 58, 138);
    doc.rect(margin, y - 4, 1.4, 6.8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(sec.heading, margin + 3.5, y + 0.7);
    y += 6.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);

    if (sec.paragraphs) {
      for (const p of sec.paragraphs) {
        if (!p) continue;
        const maxW = pageWidth - margin * 2;
        for (const subP of p.split('\n')) {
          if (!subP.trim()) continue;
          const lines = doc.splitTextToSize(subP, maxW);
          ensureSpace(lines.length * 4.5 + 2.5);
          doc.text(subP, margin, y, { maxWidth: maxW, align: 'justify' });
          y += lines.length * 4.5 + 2;
        }
      }
    }

    if (sec.bullets && sec.bullets.length > 0) {
      const maxW = pageWidth - margin * 2 - 4;
      for (const b of sec.bullets) {
        const bulletText = `• ${b}`;
        const lines = doc.splitTextToSize(bulletText, maxW);
        ensureSpace(lines.length * 4.4 + 2);
        doc.text(bulletText, margin + 2, y, { maxWidth: maxW, align: 'justify' });
        y += lines.length * 4.4 + 1.4;
      }
      y += 1.5;
    }

    if (sec.twoColumnQuestions && sec.twoColumnQuestions.length > 0) {
      const colGap = 8;
      const colWidth = (pageWidth - margin * 2 - colGap) / 2;
      const leftX = margin;
      const rightX = margin + colWidth + colGap;
      const dividerX = margin + colWidth + colGap / 2;
      const bottomLimit = pageHeight - 22;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);

      const blocks = sec.twoColumnQuestions.map((q) => {
        const stemText = `${q.number}. ${q.stem}${q.points ? ` (${q.points} poin)` : ''}`;
        const stemLines: string[] = doc.splitTextToSize(stemText, colWidth);
        const optionLineGroups: string[][] = (q.options || []).map((opt) =>
          doc.splitTextToSize(opt, colWidth - 4)
        );
        const optLineCount = optionLineGroups.reduce((sum, lines) => sum + lines.length, 0);
        const height = stemLines.length * 4.0 + optLineCount * 3.8 + 3.0;
        return { stemLines, optionLineGroups, height };
      });

      const firstMinSpace = Math.min(42, (blocks[0]?.height || 18) + 6);
      ensureSpace(firstMinSpace);

      let pageTopY = y;
      let bIdx = 0;

      while (bIdx < blocks.length) {
        const availableH = bottomLimit - pageTopY;
        const remainingH = blocks.slice(bIdx).reduce((s, b) => s + b.height, 0);
        const fitsInSinglePage = remainingH <= availableH * 1.92;
        const colSplitLimit = fitsInSinglePage
          ? Math.min(bottomLimit, Math.max(pageTopY + blocks[bIdx].height + 1, pageTopY + Math.ceil(remainingH / 2) + 4))
          : bottomLimit;

        const drawBlock = (block: (typeof blocks)[number], xPos: number, startYPos: number): number => {
          let cur = startYPos;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(15, 23, 42);
          doc.text(block.stemLines, xPos, cur);
          cur += block.stemLines.length * 4.0 + 0.5;

          doc.setTextColor(30, 41, 59);
          for (const optLines of block.optionLineGroups) {
            doc.text(optLines, xPos + 4, cur);
            cur += optLines.length * 3.8;
          }
          return cur + 2.5;
        };

        let leftY = pageTopY;
        while (bIdx < blocks.length) {
          const blk = blocks[bIdx];
          if (leftY > pageTopY && leftY + blk.height > colSplitLimit) break;
          if (leftY + blk.height > bottomLimit) break;
          leftY = drawBlock(blk, leftX, leftY);
          bIdx += 1;
        }

        let rightY = pageTopY;
        while (bIdx < blocks.length) {
          const blk = blocks[bIdx];
          if (rightY > pageTopY && rightY + blk.height > bottomLimit) break;
          if (rightY + blk.height > bottomLimit) break;
          rightY = drawBlock(blk, rightX, rightY);
          bIdx += 1;
        }

        const sectionEndY = Math.max(leftY, rightY);
        if (sectionEndY > pageTopY) {
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.2);
          doc.line(dividerX, pageTopY - 2, dividerX, sectionEndY - 2);
        }

        if (bIdx < blocks.length) {
          doc.addPage();
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text(runningHeader, pageWidth - margin, 10, { align: 'right' });
          pageTopY = 17;
        } else {
          y = sectionEndY + 3;
        }
      }
    }

    if (sec.table && sec.table.rows.length > 0) {
      ensureSpace(22);
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        theme: 'grid',
        head: [sec.table.headers],
        body: sec.table.rows.map((r) => r.map((c) => String(c ?? ''))),
        styles: {
          fontSize: 8.5,
          cellPadding: 2.3,
          lineColor: [148, 163, 184],
          lineWidth: 0.2,
          textColor: [15, 23, 42],
        },
        headStyles: {
          fillColor: [220, 230, 242],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          lineColor: [148, 163, 184],
          lineWidth: 0.2,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    } else if (!sec.twoColumnQuestions || sec.twoColumnQuestions.length === 0) {
      y += 2;
    }
  }

  // Pengesahan & Tanda Tangan
  if (payload.includeSignatures !== false) {
    ensureSpace(46);
    y += 4;
    const leftX = margin;
    const rightX = pageWidth / 2 + 10;
    const cityDate = resolveTitiMangsa(payload.school);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Mengetahui,', leftX, y);
    if (payload.showTitiMangsa !== false) {
      doc.text(cityDate, rightX, y);
    }
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text(`Kepala ${schoolName},`, leftX, y);
    doc.text('Guru Mata Pelajaran,', rightX, y);

    if (payload.teacher?.signatureDataUrl && payload.teacher.signatureDataUrl.startsWith('data:image/')) {
      try {
        doc.addImage(payload.teacher.signatureDataUrl, 'PNG', rightX, y + 2, 32, 14);
      } catch {
        // Skip invalid image safely
      }
    }

    y += 22;
    const principalName = payload.school?.principalName || '........................................';
    const teacherName = payload.school?.teacherName || payload.teacher?.displayName || '........................................';
    doc.text(principalName, leftX, y);
    doc.text(teacherName, rightX, y);
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.25);
    doc.line(leftX, y + 0.8, leftX + doc.getTextWidth(principalName), y + 0.8);
    doc.line(rightX, y + 0.8, rightX + doc.getTextWidth(teacherName), y + 0.8);

    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`NIP. ${payload.school?.principalNip || '-'}`, leftX, y);
    doc.text(`NIP. ${payload.school?.teacherNip || payload.teacher?.nip || '-'}`, rightX, y);
  }

  // Nomor Halaman
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${schoolName} · Tahun Pelajaran ${payload.school?.academicYear || '-'}`,
      margin,
      pageHeight - 9
    );
    doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - margin, pageHeight - 9, { align: 'right' });
  }

  doc.save(payload.fileName.endsWith('.pdf') ? payload.fileName : `${payload.fileName}.pdf`);
}

export async function exportDocumentDocx(payload: PrintableDocPayload) {
  const schoolName = payload.school?.name || 'Satuan Pendidikan';
  const schoolAddr = [
    payload.school?.address,
    payload.school?.district,
    payload.school?.regency,
    payload.school?.province,
  ]
    .filter(Boolean)
    .join(', ');
  const subKop = schoolAddr;

  const gridBorder = { style: BorderStyle.SINGLE, size: 6, color: '94A3B8' };
  const cellBorders = { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder };
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noCellBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
  const headerShade = { fill: 'DCE6F2' };
  const bannerShade = { fill: 'EEF4FB' };

  let children: (Paragraph | Table)[] = [];
  const docSections: {
    columnCount: 1 | 2;
    continuous: boolean;
    children: (Paragraph | Table)[];
  }[] = [];

  const flushDocxSection = (columnCount: 1 | 2) => {
    if (children.length === 0) return;
    docSections.push({
      columnCount,
      continuous: docSections.length > 0,
      children,
    });
    children = [];
  };

  const letterheadPara = await buildDocxLetterheadParagraph(payload.school);
  if (letterheadPara) {
    children.push(letterheadPara);
  } else {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: schoolName.toUpperCase(),
            bold: true,
            size: 24,
            color: '003380',
            font: 'Calibri',
          }),
        ],
      })
    );

    if (subKop) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [new TextRun({ text: subKop, size: 17, color: '475569', font: 'Calibri' })],
        })
      );
    }
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: payload.subtitle ? 40 : 180 },
      border: payload.subtitle
        ? undefined
        : { bottom: { color: '1E3A8A', space: 6, style: BorderStyle.DOUBLE, size: 12 } },
      children: [new TextRun({ text: payload.title.toUpperCase(), bold: true, size: 22, color: '0F172A', font: 'Calibri' })],
    })
  );

  if (payload.subtitle) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 180 },
        border: { bottom: { color: '1E3A8A', space: 6, style: BorderStyle.DOUBLE, size: 12 } },
        children: [new TextRun({ text: payload.subtitle, size: 19, color: '334155', font: 'Calibri' })],
      })
    );
  }

  if (payload.metadataPairs && payload.metadataPairs.length > 0) {
    children.push(
      new Table({
        width: { size: 9638, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        columnWidths: [2200, 260, 7178],
        rows: payload.metadataPairs.map(
          (m) =>
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 2200, type: WidthType.DXA },
                  borders: noCellBorders,
                  margins: { top: 20, bottom: 20, left: 0, right: 40 },
                  children: [new Paragraph({ children: [new TextRun({ text: m.label, bold: true, size: 19, font: 'Calibri' })] })],
                }),
                new TableCell({
                  width: { size: 260, type: WidthType.DXA },
                  borders: noCellBorders,
                  margins: { top: 20, bottom: 20, left: 0, right: 0 },
                  children: [new Paragraph({ children: [new TextRun({ text: ':', size: 19, font: 'Calibri' })] })],
                }),
                new TableCell({
                  width: { size: 7178, type: WidthType.DXA },
                  borders: noCellBorders,
                  margins: { top: 20, bottom: 20, left: 20, right: 0 },
                  children: [new Paragraph({ children: [new TextRun({ text: m.value || '-', size: 19, font: 'Calibri' })] })],
                }),
              ],
            })
        ),
      })
    );
  }

  for (const sec of payload.sections) {
    children.push(
      new Paragraph({ spacing: { before: 180, after: 60 }, children: [] }),
      new Table({
        width: { size: 9638, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        columnWidths: [9638],
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 9638, type: WidthType.DXA },
                shading: bannerShade,
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 4, color: 'BFDBFE' },
                  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BFDBFE' },
                  left: { style: BorderStyle.SINGLE, size: 14, color: '1E3A8A' },
                  right: { style: BorderStyle.SINGLE, size: 4, color: 'BFDBFE' },
                },
                margins: { top: 65, bottom: 65, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: sec.heading, bold: true, size: 20, color: '0F172A', font: 'Calibri' })] })],
              }),
            ],
          }),
        ],
      })
    );

    if (sec.paragraphs) {
      for (const p of sec.paragraphs) {
        if (!p) continue;
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 70, after: 60 },
            children: [new TextRun({ text: p, size: 19, font: 'Calibri' })],
          })
        );
      }
    }

    if (sec.bullets && sec.bullets.length > 0) {
      for (const b of sec.bullets) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            bullet: { level: 0 },
            spacing: { before: 30, after: 45 },
            children: [new TextRun({ text: b, size: 19, font: 'Calibri' })],
          })
        );
      }
    }

    if (sec.twoColumnQuestions && sec.twoColumnQuestions.length > 0) {
      flushDocxSection(1);
      const pgChildren: Paragraph[] = [];
      for (const q of sec.twoColumnQuestions) {
        const opts = q.options || [];
        pgChildren.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            keepLines: true,
            keepNext: opts.length > 0,
            spacing: { before: 70, after: opts.length > 0 ? 25 : 70 },
            children: [
              new TextRun({ text: `${q.number}. `, bold: true, size: 18, font: 'Calibri', color: '0F172A' }),
              new TextRun({ text: q.stem, size: 18, font: 'Calibri', color: '0F172A' }),
              ...(q.points
                ? [new TextRun({ text: ` (${q.points} poin)`, size: 16, font: 'Calibri', color: '64748B' })]
                : []),
            ],
          })
        );
        opts.forEach((opt, oi) => {
          pgChildren.push(
            new Paragraph({
              indent: { left: 260, hanging: 180 },
              keepLines: true,
              keepNext: oi < opts.length - 1,
              spacing: { before: 10, after: oi === opts.length - 1 ? 75 : 15 },
              children: [new TextRun({ text: opt, size: 18, font: 'Calibri', color: '1E293B' })],
            })
          );
        });
      }
      children = pgChildren;
      flushDocxSection(2);
    }

    if (sec.table && sec.table.rows.length > 0) {
      const colCount = sec.table.headers.length;
      const colW = Math.floor(9638 / Math.max(1, colCount));
      const widths = sec.table.headers.map(() => colW);
      const headerRow = new TableRow({
        tableHeader: true,
        children: sec.table.headers.map(
          (h) =>
            new TableCell({
              width: { size: colW, type: WidthType.DXA },
              shading: headerShade,
              borders: cellBorders,
              margins: { top: 65, bottom: 65, left: 80, right: 80 },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: h, bold: true, color: '0F172A', size: 18, font: 'Calibri' })],
                }),
              ],
            })
        ),
      });
      const bodyRows = sec.table.rows.map(
        (r) =>
          new TableRow({
            children: r.map(
              (c) =>
                new TableCell({
                  width: { size: colW, type: WidthType.DXA },
                  borders: cellBorders,
                  margins: { top: 60, bottom: 60, left: 80, right: 80 },
                  children: [new Paragraph({ children: [new TextRun({ text: String(c ?? ''), size: 18, font: 'Calibri' })] })],
                })
            ),
          })
      );
      children.push(
        new Paragraph({ spacing: { before: 80 }, children: [] }),
        new Table({
          width: { size: 9638, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          columnWidths: widths,
          rows: [headerRow, ...bodyRows],
        })
      );
    }
  }

  if (payload.includeSignatures !== false) {
    const principalName = payload.school?.principalName || '........................................';
    const teacherName = payload.school?.teacherName || payload.teacher?.displayName || '........................................';
    const teacherNip = payload.school?.teacherNip || payload.teacher?.nip || '-';
    const sigImg = decodeDataUrlBytes(payload.teacher?.signatureDataUrl);

    const teacherSignChildren: Paragraph[] = [
      new Paragraph({
        spacing: { before: 360 },
        children: [
          new TextRun({
            text:
              payload.showTitiMangsa !== false
                ? resolveTitiMangsa(payload.school)
                : ' ',
            size: 19,
            font: 'Calibri',
          }),
        ],
      }),
      new Paragraph({ children: [new TextRun({ text: 'Guru Mata Pelajaran,', bold: true, size: 19, font: 'Calibri' })] }),
    ];

    if (sigImg) {
      teacherSignChildren.push(
        new Paragraph({
          spacing: { before: 120, after: 80 },
          children: [
            new ImageRun({
              data: sigImg.bytes,
              transformation: { width: 105, height: 46 },
              type: sigImg.type,
            }),
          ],
        })
      );
    } else {
      teacherSignChildren.push(new Paragraph({ spacing: { before: 620 }, children: [] }));
    }

    teacherSignChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: teacherName,
            bold: true,
            underline: { type: UnderlineType.SINGLE },
            size: 19,
            font: 'Calibri',
          }),
        ],
      }),
      new Paragraph({
        children: [new TextRun({ text: `NIP. ${teacherNip}`, size: 17, font: 'Calibri' })],
      })
    );

    children.push(
      new Table({
        width: { size: 9638, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        columnWidths: [4819, 4819],
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 4819, type: WidthType.DXA },
                borders: noCellBorders,
                children: [
                  new Paragraph({ spacing: { before: 360 }, children: [new TextRun({ text: 'Mengetahui,', size: 19, font: 'Calibri' })] }),
                  new Paragraph({ children: [new TextRun({ text: `Kepala ${schoolName},`, bold: true, size: 19, font: 'Calibri' })] }),
                  new Paragraph({ spacing: { before: 620 }, children: [] }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: principalName,
                        bold: true,
                        underline: { type: UnderlineType.SINGLE },
                        size: 19,
                        font: 'Calibri',
                      }),
                    ],
                  }),
                  new Paragraph({ children: [new TextRun({ text: `NIP. ${payload.school?.principalNip || '-'}`, size: 17, font: 'Calibri' })] }),
                ],
              }),
              new TableCell({
                width: { size: 4819, type: WidthType.DXA },
                borders: noCellBorders,
                children: teacherSignChildren,
              }),
            ],
          }),
        ],
      })
    );
  }

  flushDocxSection(1);

  const runningDocxHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: `${schoolName}${payload.subtitle ? ` | ${payload.subtitle}` : ''}`,
            size: 17,
            color: '94A3B8',
            font: 'Calibri',
          }),
        ],
      }),
    ],
  });

  const docxDoc = new Document({
    sections: docSections.map((sec) => ({
      properties: {
        ...(sec.continuous ? { type: SectionType.CONTINUOUS } : {}),
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 960, right: 1134, bottom: 960, left: 1134 },
        },
        ...(sec.columnCount === 2
          ? {
              column: {
                count: 2,
                space: 480,
                separate: true,
                equalWidth: true,
              },
            }
          : {}),
      },
      headers: {
        default: runningDocxHeader,
      },
      children: sec.children,
    })),
  });

  const blob = await Packer.toBlob(docxDoc);
  downloadBlob(blob, payload.fileName.endsWith('.docx') ? payload.fileName : `${payload.fileName}.docx`);
}

export async function exportTableXlsx(params: {
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  const sheetData: SheetData = [
    params.headers.map((h) => ({
      value: h,
      fontWeight: 'bold' as const,
      backgroundColor: '#1E3A8A',
      color: '#FFFFFF',
    })),
    ...params.rows.map((r) =>
      r.map((cell) => ({
        value: cell ?? '',
      }))
    ),
  ];

  const columns = params.headers.map((h) => ({ width: Math.max(14, h.length + 6) }));
  const targetName = params.fileName.endsWith('.xlsx') ? params.fileName : `${params.fileName}.xlsx`;
  await writeXlsxFile(sheetData, {
    sheet: params.sheetName.slice(0, 31),
    columns,
  }).toFile(targetName);
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export async function parseStudentsExcel(file: File): Promise<
  { fullName: string; nis: string; nisn: string; gender: 'L' | 'P' | '-' }[]
> {
  let rawRows: string[][] = [];
  if (file.name.toLowerCase().endsWith('.csv')) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length > 0) {
      const delimiter = lines[0].includes(';') ? ';' : ',';
      rawRows = lines.map((line) => parseCsvLine(line, delimiter));
    }
  } else {
    const sheetRows = await readSheet(file);
    rawRows = sheetRows.map((row) => row.map((cell) => String(cell ?? '').trim()));
  }

  if (rawRows.length < 2) return [];
  const headers = rawRows[0].map((h) => h.toLowerCase());
  const findIdx = (candidates: string[]) => headers.findIndex((h) => candidates.some((c) => h.includes(c)));

  const nameIdx = findIdx(['nama lengkap', 'nama', 'fullname', 'name']);
  const nisIdx = headers.findIndex((h) => h === 'nis' || h.includes('nomor induk siswa'));
  const nisnIdx = findIdx(['nisn']);
  const genderIdx = findIdx(['l/p', 'jenis kelamin', 'kelamin', 'gender']);

  return rawRows
    .slice(1)
    .map((row) => {
      const name = String(nameIdx >= 0 ? row[nameIdx] ?? '' : row[1] ?? row[0] ?? '').trim();
      const nis = String(nisIdx >= 0 ? row[nisIdx] ?? '' : '').trim();
      const nisn = String(nisnIdx >= 0 ? row[nisnIdx] ?? '' : '').trim();
      const rawGender = String(genderIdx >= 0 ? row[genderIdx] ?? '-' : '-').trim().toUpperCase();
      const gender: 'L' | 'P' | '-' = rawGender.startsWith('L') ? 'L' : rawGender.startsWith('P') ? 'P' : '-';
      return { fullName: name, nis, nisn, gender };
    })
    .filter((s) => s.fullName.length > 0);
}

const PPT_THEMES: Record<string, { bg: string; surface: string; accent: string; text: string; muted: string }> = {
  cobalt: { bg: 'F8FAFC', surface: 'FFFFFF', accent: '1D4ED8', text: '0F172A', muted: '475569' },
  emerald: { bg: 'F0FDF4', surface: 'FFFFFF', accent: '047857', text: '064E3B', muted: '475569' },
  slate_dark: { bg: '0F172A', surface: '1E293B', accent: '38BDF8', text: 'F8FAFC', muted: 'CBD5E1' },
  indigo: { bg: 'EEF2FF', surface: 'FFFFFF', accent: '4338CA', text: '1E1B4B', muted: '475569' },
};

export async function exportSlidesPptx(params: {
  deckTitle: string;
  theme: string;
  subject: string;
  grade: string;
  schoolName?: string;
  teacherName?: string;
  slides: PptSlideSpec[];
  fileName: string;
}) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = params.deckTitle;
  pptx.author = params.teacherName || 'AI SMART TEACHER';

  const palette = PPT_THEMES[params.theme] || PPT_THEMES.cobalt;

  for (let i = 0; i < params.slides.length; i++) {
    const s = params.slides[i];
    const slide = pptx.addSlide();
    slide.background = { color: i === 0 ? palette.accent : palette.bg };

    if (i === 0) {
      slide.addText(params.subject.toUpperCase(), {
        x: 0.8,
        y: 1.1,
        w: 8.4,
        h: 0.4,
        fontSize: 13,
        bold: true,
        color: 'E2E8F0',
      });
      slide.addText(s.title || params.deckTitle, {
        x: 0.8,
        y: 1.7,
        w: 8.4,
        h: 1.6,
        fontSize: 32,
        bold: true,
        color: 'FFFFFF',
      });
      slide.addText(s.subtitle || `${params.grade} · ${params.schoolName || ''}`, {
        x: 0.8,
        y: 3.5,
        w: 8.4,
        h: 0.6,
        fontSize: 16,
        color: 'E2E8F0',
      });
      slide.addText(params.teacherName ? `Disusun oleh: ${params.teacherName}` : '', {
        x: 0.8,
        y: 4.5,
        w: 8.4,
        h: 0.4,
        fontSize: 12,
        color: 'CBD5E1',
      });
    } else {
      // Top header accent bar
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 10,
        h: 0.14,
        fill: { color: palette.accent },
      });

      slide.addText(`${s.slideType || 'Materi'} · Slide ${s.slideNumber}`, {
        x: 0.6,
        y: 0.3,
        w: 8.8,
        h: 0.3,
        fontSize: 10,
        bold: true,
        color: palette.accent,
      });

      slide.addText(s.title, {
        x: 0.6,
        y: 0.65,
        w: 8.8,
        h: 0.65,
        fontSize: 22,
        bold: true,
        color: palette.text,
      });

      const hasDiagram = s.diagramNodes && s.diagramNodes.length > 0;
      const bulletW = hasDiagram ? 5.2 : 8.8;

      if (s.bullets && s.bullets.length > 0) {
        slide.addText(
          s.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
          {
            x: 0.6,
            y: 1.45,
            w: bulletW,
            h: 3.3,
            fontSize: 15,
            color: palette.text,
            valign: 'top',
            lineSpacingMultiple: 1.35,
          }
        );
      }

      if (hasDiagram && s.diagramNodes) {
        const nodes = s.diagramNodes.slice(0, 4);
        nodes.forEach((node, idx) => {
          const boxY = 1.5 + idx * 0.88;
          slide.addShape(pptx.ShapeType.roundRect, {
            x: 6.1,
            y: boxY,
            w: 3.3,
            h: 0.68,
            fill: { color: palette.surface },
            line: { color: palette.accent, width: 1.5 },
            rectRadius: 0.08,
          });
          slide.addText(`${idx + 1}. ${node}`, {
            x: 6.25,
            y: boxY + 0.08,
            w: 3.0,
            h: 0.52,
            fontSize: 12,
            bold: true,
            color: palette.text,
            valign: 'middle',
          });
        });
      }

      slide.addText(`${params.deckTitle} — ${params.schoolName || 'AI SMART TEACHER'}`, {
        x: 0.6,
        y: 5.15,
        w: 8.8,
        h: 0.25,
        fontSize: 9,
        color: palette.muted,
      });
    }

    if (s.presenterNotes || s.animationNote) {
      slide.addNotes(
        [
          s.presenterNotes ? `Catatan Pengajaran:\n${s.presenterNotes}` : '',
          s.animationNote ? `\nPanduan Animasi/Transisi:\n${s.animationNote}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      );
    }
  }

  await pptx.writeFile({
    fileName: params.fileName.endsWith('.pptx') ? params.fileName : `${params.fileName}.pptx`,
  });
}

export interface ProsemMatrixMonthSpec {
  full: string;
  short: string;
}

export interface ProsemMatrixTopicRow {
  no: number;
  topic: string;
  jp: number;
  activeWeeks: boolean[]; // Length 24: 6 months x 4 weeks
}

export interface ProsemMatrixExportPayload {
  semesterLabel: 'Ganjil' | 'Genap';
  subject: string;
  grade: string;
  phase: string;
  academicYear: string;
  fileName: string;
  school?: SchoolIdentity | null;
  teacher?: UserProfile | null;
  months: ProsemMatrixMonthSpec[];
  rows: ProsemMatrixTopicRow[];
  totalJp: number;
  evaluationCalendar: ProsemEvaluationEntry[];
}

export function exportProsemMatrixPdf(payload: ProsemMatrixExportPayload) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const schoolName = payload.school?.name || 'Satuan Pendidikan';
  const runningHeaderText = `${schoolName} | ${payload.subject} ${payload.grade}`;
  let y = 18;

  // Running header top-right on page 1
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(runningHeaderText, pageWidth - margin, 10, { align: 'right' });

  // Kop Sekolah
  const customKopY = drawPdfLetterhead(doc, payload.school, pageWidth, margin, 13);
  if (customKopY !== null) {
    y = customKopY;
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0, 51, 128);
    doc.text(schoolName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
    y += 5.5;
  }

  // Judul PROSEM
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  const titleText = `PROSEM ${payload.semesterLabel.toUpperCase()} ${payload.subject.toUpperCase()} KELAS ${payload.grade.toUpperCase()} — TAHUN PELAJARAN ${payload.academicYear}`;
  const titleLines = doc.splitTextToSize(titleText, pageWidth - margin * 2);
  doc.text(titleLines, pageWidth / 2, y, { align: 'center' });
  y += titleLines.length * 4.5 + 1;

  // Double divider line
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineWidth(0.2);
  doc.line(margin, y + 1, pageWidth - margin, y + 1);
  y += 6.5;

  // Metadata pairs
  const schoolValue = schoolName;
  const teacherName = payload.school?.teacherName || payload.teacher?.displayName || '-';
  const teacherNip = payload.school?.teacherNip || payload.teacher?.nip || '-';
  const metadataRows = [
    ['Sekolah', ':', schoolValue],
    ['Mata Pelajaran', ':', payload.subject || '-'],
    ['Fase / Kelas', ':', `${payload.phase || '-'} / ${payload.grade || '-'}`],
    ['Tahun Pelajaran', ':', `${payload.academicYear || '-'} · Semester ${payload.semesterLabel}`],
    ['Guru Mata Pelajaran', ':', teacherName],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.1, textColor: [15, 23, 42] },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold' },
      1: { cellWidth: 4 },
    },
    body: metadataRows,
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Section 1 heading
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Distribusi Program Semester ${payload.semesterLabel}`, margin, y);
  y += 3.5;

  const headRow1: any[] = [
    { content: 'No', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
    { content: 'Materi / Tujuan Pembelajaran', rowSpan: 2, styles: { halign: 'left', valign: 'middle' } },
    { content: 'JP', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
    ...payload.months.map((m) => ({
      content: m.short,
      colSpan: 4,
      styles: { halign: 'center', valign: 'middle' },
    })),
  ];

  const headRow2: any[] = [];
  for (let m = 0; m < payload.months.length; m++) {
    for (let w = 1; w <= 4; w++) {
      headRow2.push({
        content: String(w),
        styles: { halign: 'center', valign: 'middle', fontSize: 6.5 },
      });
    }
  }

  const bodyRows: any[] = payload.rows.map((r) => [
    { content: String(r.no), styles: { halign: 'center' } },
    { content: r.topic, styles: { halign: 'left' } },
    { content: String(r.jp), styles: { halign: 'center', fontStyle: 'bold' } },
    ...r.activeWeeks.map(() => ({ content: '', styles: { halign: 'center' } })),
  ]);

  const effectiveMonthsText = `Distribusi pekan efektif: ${payload.months.map((m) => m.short).join(' — ')}`;
  bodyRows.push([
    {
      content: `Total Alokasi JP Semester ${payload.semesterLabel}`,
      colSpan: 2,
      styles: { halign: 'right', fontStyle: 'bold', fillColor: [248, 250, 252] },
    },
    {
      content: `${payload.totalJp} JP`,
      styles: { halign: 'center', fontStyle: 'bold', fillColor: [248, 250, 252] },
    },
    {
      content: effectiveMonthsText,
      colSpan: 24,
      styles: { halign: 'left', fontSize: 7.5, textColor: [71, 85, 105], fillColor: [248, 250, 252] },
    },
  ]);

  const weekColStyles: Record<number, { cellWidth: number }> = {
    0: { cellWidth: 8 },
    1: { cellWidth: 64 },
    2: { cellWidth: 12 },
  };
  for (let i = 0; i < 24; i++) {
    weekColStyles[3 + i] = { cellWidth: 4.0 };
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [headRow1, headRow2],
    body: bodyRows,
    styles: {
      fontSize: 8,
      cellPadding: { top: 1.6, bottom: 1.6, left: 0.6, right: 0.6 },
      lineColor: [148, 163, 184],
      lineWidth: 0.2,
      textColor: [15, 23, 42],
      valign: 'middle',
    },
    headStyles: {
      fillColor: [220, 230, 242],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      lineColor: [148, 163, 184],
      lineWidth: 0.2,
    },
    columnStyles: weekColStyles,
    didDrawCell: (data) => {
      if (data.section === 'body' && data.row.index < payload.rows.length && data.column.index >= 3) {
        const weekIdx = data.column.index - 3;
        const rowData = payload.rows[data.row.index];
        if (rowData?.activeWeeks?.[weekIdx]) {
          const cx = data.cell.x + data.cell.width / 2;
          const cy = data.cell.y + data.cell.height / 2;
          doc.setDrawColor(29, 78, 216);
          doc.setLineWidth(0.42);
          doc.line(cx - 0.9, cy + 0.1, cx - 0.2, cy + 0.85);
          doc.line(cx - 0.2, cy + 0.85, cx + 1.0, cy - 0.85);
        }
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 7;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 22) {
      doc.addPage();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(runningHeaderText, pageWidth - margin, 10, { align: 'right' });
      y = 18;
    }
  };

  // Section A. Kalender Evaluasi Semester
  if (payload.evaluationCalendar.length > 0) {
    ensureSpace(32);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text('A. Kalender Evaluasi Semester', margin, y);
    y += 3.5;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      head: [['Periode', 'Jenis Evaluasi', 'Status', 'Materi Esensial']],
      body: payload.evaluationCalendar.map((e) => [
        e.period || '-',
        e.evaluationType || '-',
        e.status || 'DRAF',
        e.essentialMaterial || '-',
      ]),
      styles: {
        fontSize: 8.5,
        cellPadding: 2.2,
        lineColor: [148, 163, 184],
        lineWidth: 0.2,
        textColor: [15, 23, 42],
      },
      headStyles: {
        fillColor: [220, 230, 242],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        lineColor: [148, 163, 184],
        lineWidth: 0.2,
      },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 56 },
        2: { cellWidth: 22 },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 9;
  }

  // Signature block
  ensureSpace(42);
  const leftX = margin;
  const rightX = pageWidth / 2 + 10;
  const cityDate = resolveTitiMangsa(payload.school);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Mengetahui,', leftX, y);
  doc.text(cityDate, rightX, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(`Kepala ${schoolName},`, leftX, y);
  doc.text(`Guru Mata Pelajaran ${payload.subject},`, rightX, y);

  if (payload.teacher?.signatureDataUrl && payload.teacher.signatureDataUrl.startsWith('data:image/')) {
    try {
      doc.addImage(payload.teacher.signatureDataUrl, 'PNG', rightX, y + 2, 32, 14);
    } catch {
      // Skip invalid image safely
    }
  }

  y += 22;
  const principalName = payload.school?.principalName || '........................................';
  doc.text(principalName, leftX, y);
  doc.text(teacherName, rightX, y);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.25);
  doc.line(leftX, y + 0.8, leftX + doc.getTextWidth(principalName), y + 0.8);
  doc.line(rightX, y + 0.8, rightX + doc.getTextWidth(teacherName), y + 0.8);

  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`NIP. ${payload.school?.principalNip || '-'}`, leftX, y);
  doc.text(`NIP. ${teacherNip}`, rightX, y);

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${schoolName} · Tahun Pelajaran ${payload.academicYear || '-'}`, margin, pageHeight - 9);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - margin, pageHeight - 9, { align: 'right' });
  }

  doc.save(payload.fileName.endsWith('.pdf') ? payload.fileName : `${payload.fileName}.pdf`);
}

export async function exportProsemMatrixDocx(payload: ProsemMatrixExportPayload) {
  const schoolName = payload.school?.name || 'Satuan Pendidikan';
  const schoolValue = schoolName;
  const teacherName = payload.school?.teacherName || payload.teacher?.displayName || '-';
  const teacherNip = payload.school?.teacherNip || payload.teacher?.nip || '-';
  const principalName = payload.school?.principalName || '........................................';

  const gridBorder = { style: BorderStyle.SINGLE, size: 6, color: '64748B' };
  const cellBorders = { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder };
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noCellBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
  const headerShade = { fill: 'DCE6F2' };

  const children: (Paragraph | Table)[] = [];

  // Kop Sekolah
  const letterheadPara = await buildDocxLetterheadParagraph(payload.school);
  if (letterheadPara) {
    children.push(letterheadPara);
  } else {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: schoolName.toUpperCase(),
            bold: true,
            size: 24,
            color: '003380',
            font: 'Calibri',
          }),
        ],
      })
    );
  }
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 220 },
      border: {
        bottom: {
          color: '1E3A8A',
          space: 6,
          style: BorderStyle.DOUBLE,
          size: 12,
        },
      },
      children: [
        new TextRun({
          text: `PROSEM ${payload.semesterLabel.toUpperCase()} ${payload.subject.toUpperCase()} KELAS ${payload.grade.toUpperCase()} — TAHUN PELAJARAN ${payload.academicYear}`,
          bold: true,
          size: 21,
          color: '0F172A',
          font: 'Calibri',
        }),
      ],
    })
  );

  // Metadata pairs
  const metaPairs = [
    ['Sekolah', schoolValue],
    ['Mata Pelajaran', payload.subject || '-'],
    ['Fase / Kelas', `${payload.phase || '-'} / ${payload.grade || '-'}`],
    ['Tahun Pelajaran', `${payload.academicYear || '-'} · Semester ${payload.semesterLabel}`],
    ['Guru Mata Pelajaran', teacherName],
  ];

  children.push(
    new Table({
      width: { size: 9638, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [2200, 260, 7178],
      rows: metaPairs.map(
        ([label, val]) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 2200, type: WidthType.DXA },
                borders: noCellBorders,
                margins: { top: 20, bottom: 20, left: 0, right: 40 },
                children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 19, font: 'Calibri' })] })],
              }),
              new TableCell({
                width: { size: 260, type: WidthType.DXA },
                borders: noCellBorders,
                margins: { top: 20, bottom: 20, left: 0, right: 0 },
                children: [new Paragraph({ children: [new TextRun({ text: ':', size: 19, font: 'Calibri' })] })],
              }),
              new TableCell({
                width: { size: 7178, type: WidthType.DXA },
                borders: noCellBorders,
                margins: { top: 20, bottom: 20, left: 20, right: 0 },
                children: [new Paragraph({ children: [new TextRun({ text: val, size: 19, font: 'Calibri' })] })],
              }),
            ],
          })
      ),
    })
  );

  // Section 1 title
  children.push(
    new Paragraph({
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: `Distribusi Program Semester ${payload.semesterLabel}`,
          bold: true,
          size: 22,
          color: '0F172A',
          font: 'Calibri',
        }),
      ],
    })
  );

  // 27 column widths summing to 9638 DXA
  const colWidths = [520, 3500, 650, ...Array(24).fill(207)];

  const headerRow1 = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        width: { size: 520, type: WidthType.DXA },
        rowSpan: 2,
        verticalAlign: VerticalAlign.CENTER,
        shading: headerShade,
        borders: cellBorders,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'No', bold: true, size: 18, font: 'Calibri' })] })],
      }),
      new TableCell({
        width: { size: 3500, type: WidthType.DXA },
        rowSpan: 2,
        verticalAlign: VerticalAlign.CENTER,
        shading: headerShade,
        borders: cellBorders,
        margins: { left: 80, right: 80 },
        children: [new Paragraph({ children: [new TextRun({ text: 'Materi / Tujuan Pembelajaran', bold: true, size: 18, font: 'Calibri' })] })],
      }),
      new TableCell({
        width: { size: 650, type: WidthType.DXA },
        rowSpan: 2,
        verticalAlign: VerticalAlign.CENTER,
        shading: headerShade,
        borders: cellBorders,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'JP', bold: true, size: 18, font: 'Calibri' })] })],
      }),
      ...payload.months.map(
        (m) =>
          new TableCell({
            width: { size: 828, type: WidthType.DXA },
            columnSpan: 4,
            verticalAlign: VerticalAlign.CENTER,
            shading: headerShade,
            borders: cellBorders,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: m.short, bold: true, size: 17, font: 'Calibri' })],
              }),
            ],
          })
      ),
    ],
  });

  const headerRow2 = new TableRow({
    tableHeader: true,
    children: Array.from({ length: 24 }, (_, idx) => {
      const weekNum = (idx % 4) + 1;
      return new TableCell({
        width: { size: 207, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: headerShade,
        borders: cellBorders,
        margins: { top: 40, bottom: 40, left: 10, right: 10 },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: String(weekNum), bold: true, size: 15, font: 'Calibri' })],
          }),
        ],
      });
    }),
  });

  const dataRows = payload.rows.map(
    (r) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 520, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            borders: cellBorders,
            margins: { top: 60, bottom: 60, left: 40, right: 40 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(r.no), size: 18, font: 'Calibri' })] })],
          }),
          new TableCell({
            width: { size: 3500, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            borders: cellBorders,
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: [new Paragraph({ children: [new TextRun({ text: r.topic, size: 18, font: 'Calibri' })] })],
          }),
          new TableCell({
            width: { size: 650, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            borders: cellBorders,
            margins: { top: 60, bottom: 60, left: 40, right: 40 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(r.jp), bold: true, size: 18, font: 'Calibri' })] })],
          }),
          ...r.activeWeeks.map(
            (active) =>
              new TableCell({
                width: { size: 207, type: WidthType.DXA },
                verticalAlign: VerticalAlign.CENTER,
                borders: cellBorders,
                margins: { top: 40, bottom: 40, left: 10, right: 10 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({
                        text: active ? '✓' : '',
                        bold: active,
                        color: '1D4ED8',
                        size: 17,
                        font: 'Calibri',
                      }),
                    ],
                  }),
                ],
              })
          ),
        ],
      })
  );

  const footerRow = new TableRow({
    children: [
      new TableCell({
        width: { size: 4020, type: WidthType.DXA },
        columnSpan: 2,
        verticalAlign: VerticalAlign.CENTER,
        borders: cellBorders,
        margins: { top: 70, bottom: 70, left: 80, right: 80 },
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: `Total Alokasi JP Semester ${payload.semesterLabel}`,
                bold: true,
                size: 18,
                font: 'Calibri',
              }),
            ],
          }),
        ],
      }),
      new TableCell({
        width: { size: 650, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        borders: cellBorders,
        margins: { top: 70, bottom: 70, left: 40, right: 40 },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `${payload.totalJp} JP`, bold: true, size: 18, font: 'Calibri' })],
          }),
        ],
      }),
      new TableCell({
        width: { size: 4968, type: WidthType.DXA },
        columnSpan: 24,
        verticalAlign: VerticalAlign.CENTER,
        borders: cellBorders,
        margins: { top: 70, bottom: 70, left: 80, right: 80 },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: `Distribusi pekan efektif: ${payload.months.map((m) => m.short).join(' — ')}`,
                size: 16,
                color: '475569',
                font: 'Calibri',
              }),
            ],
          }),
        ],
      }),
    ],
  });

  children.push(
    new Table({
      width: { size: 9638, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: colWidths,
      rows: [headerRow1, headerRow2, ...dataRows, footerRow],
    })
  );

  // Section A. Kalender Evaluasi Semester
  if (payload.evaluationCalendar.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 280, after: 120 },
        children: [
          new TextRun({
            text: 'A. Kalender Evaluasi Semester',
            bold: true,
            size: 22,
            color: '0F172A',
            font: 'Calibri',
          }),
        ],
      })
    );

    const evalColWidths = [1800, 3200, 1300, 3338];
    const evalHeader = new TableRow({
      tableHeader: true,
      children: ['Periode', 'Jenis Evaluasi', 'Status', 'Materi Esensial'].map(
        (title, idx) =>
          new TableCell({
            width: { size: evalColWidths[idx], type: WidthType.DXA },
            shading: headerShade,
            borders: cellBorders,
            margins: { top: 70, bottom: 70, left: 100, right: 100 },
            children: [new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 18, font: 'Calibri' })] })],
          })
      ),
    });

    const evalRows = payload.evaluationCalendar.map(
      (ev) =>
        new TableRow({
          children: [ev.period || '-', ev.evaluationType || '-', ev.status || 'DRAF', ev.essentialMaterial || '-'].map(
            (val, idx) =>
              new TableCell({
                width: { size: evalColWidths[idx], type: WidthType.DXA },
                borders: cellBorders,
                margins: { top: 70, bottom: 70, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: val, size: 18, font: 'Calibri' })] })],
              })
          ),
        })
    );

    children.push(
      new Table({
        width: { size: 9638, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        columnWidths: evalColWidths,
        rows: [evalHeader, ...evalRows],
      })
    );
  }

  // Signature block
  const sigImg = decodeDataUrlBytes(payload.teacher?.signatureDataUrl);
  const teacherSignChildren: Paragraph[] = [
    new Paragraph({
      spacing: { before: 380 },
      children: [
        new TextRun({
          text: resolveTitiMangsa(payload.school),
          size: 19,
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      children: [new TextRun({ text: `Guru Mata Pelajaran ${payload.subject},`, bold: true, size: 19, font: 'Calibri' })],
    }),
  ];

  if (sigImg) {
    teacherSignChildren.push(
      new Paragraph({
        spacing: { before: 120, after: 80 },
        children: [
          new ImageRun({
            data: sigImg.bytes,
            transformation: { width: 105, height: 46 },
            type: sigImg.type,
          }),
        ],
      })
    );
  } else {
    teacherSignChildren.push(new Paragraph({ spacing: { before: 640 }, children: [] }));
  }

  teacherSignChildren.push(
    new Paragraph({
      children: [
        new TextRun({
          text: teacherName,
          bold: true,
          underline: { type: UnderlineType.SINGLE },
          size: 19,
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      children: [new TextRun({ text: `NIP. ${teacherNip}`, size: 17, font: 'Calibri' })],
    })
  );

  children.push(
    new Table({
      width: { size: 9638, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [4819, 4819],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 4819, type: WidthType.DXA },
              borders: noCellBorders,
              children: [
                new Paragraph({ spacing: { before: 380 }, children: [new TextRun({ text: 'Mengetahui,', size: 19, font: 'Calibri' })] }),
                new Paragraph({ children: [new TextRun({ text: `Kepala ${schoolName},`, bold: true, size: 19, font: 'Calibri' })] }),
                new Paragraph({ spacing: { before: 640 }, children: [] }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: principalName,
                      bold: true,
                      underline: { type: UnderlineType.SINGLE },
                      size: 19,
                      font: 'Calibri',
                    }),
                  ],
                }),
                new Paragraph({
                  children: [new TextRun({ text: `NIP. ${payload.school?.principalNip || '-'}`, size: 17, font: 'Calibri' })],
                }),
              ],
            }),
            new TableCell({
              width: { size: 4819, type: WidthType.DXA },
              borders: noCellBorders,
              children: teacherSignChildren,
            }),
          ],
        }),
      ],
    })
  );

  const docxDoc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4 Portrait
            margin: { top: 960, right: 1134, bottom: 960, left: 1134 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `${schoolName} | ${payload.subject} ${payload.grade}`,
                    size: 17,
                    color: '94A3B8',
                    font: 'Calibri',
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(docxDoc);
  downloadBlob(blob, payload.fileName.endsWith('.docx') ? payload.fileName : `${payload.fileName}.docx`);
}

export async function exportProsemMatrixXlsx(payload: ProsemMatrixExportPayload) {
  const weekHeaders = payload.months.flatMap((m) => [1, 2, 3, 4].map((w) => `${m.short} M${w}`));
  const headers = ['No', 'Materi / Tujuan Pembelajaran', 'JP', ...weekHeaders];

  const sheetData: SheetData = [
    [
      {
        value: `PROSEM ${payload.semesterLabel.toUpperCase()} — ${payload.subject} (${payload.grade}) · ${payload.academicYear}`,
        fontWeight: 'bold' as const,
      },
    ],
    [],
    headers.map((h) => ({
      value: h,
      fontWeight: 'bold' as const,
      backgroundColor: '#DCE6F2',
      color: '#0F172A',
    })),
    ...payload.rows.map((r) => [
      { value: r.no },
      { value: r.topic },
      { value: r.jp },
      ...r.activeWeeks.map((active) => ({ value: active ? '✓' : '' })),
    ]),
    [
      { value: '' },
      { value: `Total Alokasi JP Semester ${payload.semesterLabel}`, fontWeight: 'bold' as const },
      { value: `${payload.totalJp} JP`, fontWeight: 'bold' as const },
    ],
  ];

  if (payload.evaluationCalendar.length > 0) {
    sheetData.push([]);
    sheetData.push([{ value: 'A. Kalender Evaluasi Semester', fontWeight: 'bold' as const }]);
    sheetData.push(
      ['Periode', 'Jenis Evaluasi', 'Status', 'Materi Esensial'].map((h) => ({
        value: h,
        fontWeight: 'bold' as const,
        backgroundColor: '#DCE6F2',
        color: '#0F172A',
      }))
    );
    for (const ev of payload.evaluationCalendar) {
      sheetData.push([
        { value: ev.period },
        { value: ev.evaluationType },
        { value: ev.status },
        { value: ev.essentialMaterial },
      ]);
    }
  }

  const columns = [
    { width: 6 },
    { width: 38 },
    { width: 8 },
    ...Array.from({ length: 24 }, () => ({ width: 7 })),
  ];

  const targetName = payload.fileName.endsWith('.xlsx') ? payload.fileName : `${payload.fileName}.xlsx`;
  await writeXlsxFile(sheetData, {
    sheet: `PROSEM ${payload.semesterLabel}`,
    columns,
  }).toFile(targetName);
}

export interface LkpdExportPayload {
  title: string;
  fileName: string;
  subject: string;
  grade: string;
  level?: string;
  defaultDuration?: string;
  semester: string;
  academicYear: string;
  school?: SchoolIdentity | null;
  teacher?: UserProfile | null;
  content: {
    jenisLkpd?: string;
    judulKegiatan?: string;
    identitasLkpd?: {
      topik?: string;
      subtema?: string;
      kelas?: string;
      semester?: string;
      alokasiWaktu?: string;
    };
    petaKebutuhan?: string;
    capaianKompetensi?: string;
    tujuan?: string;
    petunjukPengerjaan?: string[];
    alatDanBahan?: string[];
    materiSingkat?: string;
    langkahKegiatan?: string[];
    aktivitasUtama?: string;
    pertanyaanPemahaman?: string[];
    tugasPraktik?: string;
    kolomTabelPengamatan?: string[];
    panduanKesimpulan?: string;
    soalSingkatPenilaian?: { soal: string; skorMaksimal: number }[];
    refleksi?: string[];
    rubrikPenilaian?: { aspek: string; skorMaksimal: number; kriteria: string }[];
  };
}

export function exportLkpdPdf(payload: LkpdExportPayload) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const c = payload.content || {};
  const schoolName = payload.school?.name || 'Satuan Pendidikan';
  let y = 16;

  // Header Sekolah & Jenis LKPD
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`${schoolName} | ${payload.subject} ${payload.grade}`, pageWidth - margin, 10, { align: 'right' });

  const customKopY = drawPdfLetterhead(doc, payload.school, pageWidth, margin, 13);
  if (customKopY !== null) {
    y = customKopY;
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(0, 51, 128);
    doc.text(schoolName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
    y += 5;
  }

  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('LEMBAR KERJA PESERTA DIDIK (LKPD)', pageWidth / 2, y, { align: 'center' });
  y += 4.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(4, 120, 87);
  doc.text((c.jenisLkpd || 'LKPD').toUpperCase(), pageWidth / 2, y, { align: 'center' });
  y += 2.5;

  doc.setDrawColor(4, 120, 87);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineWidth(0.2);
  doc.line(margin, y + 1, pageWidth - margin, y + 1);
  y += 6;

  // Kotak Identitas Siswa / Kelompok
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2, lineColor: [148, 163, 184], lineWidth: 0.2, textColor: [15, 23, 42] },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'bold', fillColor: [241, 245, 249] },
      1: { cellWidth: 52 },
      2: { cellWidth: 34, fontStyle: 'bold', fillColor: [241, 245, 249] },
      3: { cellWidth: 54 },
    },
    body: [
      ['Nama / Kelompok', '.............................................', 'Mata Pelajaran', payload.subject || '-'],
      ['Kelas / Semester', `${c.identitasLkpd?.kelas || payload.grade} / ${c.identitasLkpd?.semester || payload.semester}`, 'Alokasi Waktu', c.identitasLkpd?.alokasiWaktu || payload.defaultDuration || formatJpDuration(2, payload.level, payload.grade)],
      ['Hari / Tanggal', '.............................................', 'Tahun Pelajaran', payload.academicYear || '-'],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 20) {
      doc.addPage();
      y = 16;
    }
  };

  const drawSectionHeader = (num: number, title: string) => {
    ensureSpace(14);
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(167, 243, 208);
    doc.rect(margin, y - 4, pageWidth - margin * 2, 7, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(6, 78, 59);
    doc.text(`${num}. ${title}`, margin + 2.5, y + 0.8);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
  };

  const writeWrapped = (text: string, indent = 0, boldPrefix?: string) => {
    if (!text) return;
    const fullText = boldPrefix ? `${boldPrefix} ${text}` : text;
    const maxW = pageWidth - margin * 2 - indent;
    const lines = doc.splitTextToSize(fullText, maxW);
    ensureSpace(lines.length * 4.4 + 2);
    doc.text(fullText, margin + indent, y, { maxWidth: maxW, align: 'justify' });
    y += lines.length * 4.4 + 1.5;
  };

  // 1. Judul
  drawSectionHeader(1, 'Judul Kegiatan');
  doc.setFont('helvetica', 'bold');
  writeWrapped(c.judulKegiatan || payload.title);
  doc.setFont('helvetica', 'normal');
  writeWrapped(`Topik / Subtema: ${c.identitasLkpd?.topik || payload.title}${c.identitasLkpd?.subtema ? ` — ${c.identitasLkpd.subtema}` : ''}`);
  y += 2;

  // 2. Petunjuk Belajar
  drawSectionHeader(2, 'Petunjuk Belajar');
  (c.petunjukPengerjaan || []).forEach((step, idx) => {
    writeWrapped(`${idx + 1}. ${step}`, 2);
  });
  y += 2;

  // 3. Kompetensi / Tujuan Pembelajaran
  drawSectionHeader(3, 'Kompetensi / Tujuan Pembelajaran');
  if (c.capaianKompetensi) writeWrapped(c.capaianKompetensi, 0, 'Capaian / Kompetensi:');
  writeWrapped(c.tujuan || '-', 0, 'Tujuan Pembelajaran:');
  if (c.petaKebutuhan) writeWrapped(c.petaKebutuhan, 0, 'Posisi Unit Belajar:');
  y += 2;

  // 4. Informasi Pendukung
  drawSectionHeader(4, 'Informasi Pendukung');
  writeWrapped(c.materiSingkat || '-');
  if (c.alatDanBahan && c.alatDanBahan.length > 0) {
    writeWrapped(`Alat dan Bahan: ${c.alatDanBahan.join(', ')}`, 0);
  }
  y += 2;

  // 5. Tugas & Langkah Kerja
  drawSectionHeader(5, 'Tugas & Langkah Kerja');
  if (c.aktivitasUtama) writeWrapped(c.aktivitasUtama, 0, 'Aktivitas Utama:');
  if (c.langkahKegiatan && c.langkahKegiatan.length > 0) {
    doc.setFont('helvetica', 'bold');
    writeWrapped('Langkah Kerja:');
    doc.setFont('helvetica', 'normal');
    c.langkahKegiatan.forEach((step, idx) => writeWrapped(`${idx + 1}. ${step}`, 2));
  }

  if (c.kolomTabelPengamatan && c.kolomTabelPengamatan.length > 0) {
    ensureSpace(26);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      head: [c.kolomTabelPengamatan],
      body: [
        c.kolomTabelPengamatan.map(() => ' '),
        c.kolomTabelPengamatan.map(() => ' '),
        c.kolomTabelPengamatan.map(() => ' '),
      ],
      styles: { fontSize: 8.5, cellPadding: 3.5, lineColor: [148, 163, 184], lineWidth: 0.2 },
      headStyles: { fillColor: [220, 230, 242], textColor: [15, 23, 42], fontStyle: 'bold' },
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  }

  if (c.pertanyaanPemahaman && c.pertanyaanPemahaman.length > 0) {
    doc.setFont('helvetica', 'bold');
    writeWrapped('Pertanyaan Pemahaman:');
    doc.setFont('helvetica', 'normal');
    c.pertanyaanPemahaman.forEach((q, idx) => {
      writeWrapped(`${idx + 1}. ${q}`, 2);
      ensureSpace(9);
      doc.setDrawColor(203, 213, 225);
      doc.line(margin + 5, y + 2, pageWidth - margin, y + 2);
      y += 6;
    });
  }

  if (c.tugasPraktik) writeWrapped(c.tugasPraktik, 0, 'Tugas Praktik:');
  if (c.panduanKesimpulan) writeWrapped(c.panduanKesimpulan, 0, 'Kesimpulan:');
  y += 2;

  // 6. Penilaian (PAP) & Refleksi
  drawSectionHeader(6, 'Penilaian & Refleksi');
  if (c.soalSingkatPenilaian && c.soalSingkatPenilaian.length > 0) {
    doc.setFont('helvetica', 'bold');
    writeWrapped('Soal Evaluasi Singkat:');
    doc.setFont('helvetica', 'normal');
    c.soalSingkatPenilaian.forEach((item, idx) => {
      writeWrapped(`${idx + 1}. ${item.soal} (Skor Maks: ${item.skorMaksimal})`, 2);
    });
  }

  if (c.refleksi && c.refleksi.length > 0) {
    doc.setFont('helvetica', 'bold');
    writeWrapped('Refleksi Peserta Didik:');
    doc.setFont('helvetica', 'normal');
    c.refleksi.forEach((r, idx) => writeWrapped(`${idx + 1}. ${r}`, 2));
  }

  if (c.rubrikPenilaian && c.rubrikPenilaian.length > 0) {
    ensureSpace(24);
    const totalSkor = c.rubrikPenilaian.reduce((acc, r) => acc + Number(r.skorMaksimal || 0), 0);
    autoTable(doc, {
      startY: y + 1,
      margin: { left: margin, right: margin },
      theme: 'grid',
      head: [['Aspek Penilaian (PAP)', 'Kriteria Pencapaian', 'Skor Maks', 'Skor Diperoleh']],
      body: [
        ...c.rubrikPenilaian.map((r) => [r.aspek, r.kriteria, String(r.skorMaksimal), '']),
        ['Total Skor / Nilai Akhir', '', String(totalSkor), ''],
      ],
      styles: { fontSize: 8.5, cellPadding: 2.2, lineColor: [148, 163, 184], lineWidth: 0.2, textColor: [15, 23, 42] },
      headStyles: { fillColor: [220, 230, 242], textColor: [15, 23, 42], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 42 }, 2: { cellWidth: 20, halign: 'center' }, 3: { cellWidth: 26, halign: 'center' } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${schoolName} · LKPD ${payload.subject}`, margin, pageHeight - 9);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - margin, pageHeight - 9, { align: 'right' });
  }

  doc.save(payload.fileName.endsWith('.pdf') ? payload.fileName : `${payload.fileName}.pdf`);
}

export async function exportLkpdDocx(payload: LkpdExportPayload) {
  const c = payload.content || {};
  const schoolName = payload.school?.name || 'Satuan Pendidikan';
  const gridBorder = { style: BorderStyle.SINGLE, size: 6, color: '94A3B8' };
  const cellBorders = { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder };
  const headerShade = { fill: 'DCE6F2' };
  const sectionShade = { fill: 'ECFDF5' };

  const children: (Paragraph | Table)[] = [];

  const letterheadPara = await buildDocxLetterheadParagraph(payload.school);
  if (letterheadPara) {
    children.push(letterheadPara);
  } else {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: schoolName.toUpperCase(), bold: true, size: 22, color: '003380', font: 'Calibri' })],
      })
    );
  }
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: 'LEMBAR KERJA PESERTA DIDIK (LKPD)', bold: true, size: 24, color: '0F172A', font: 'Calibri' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
      border: { bottom: { color: '047857', space: 6, style: BorderStyle.DOUBLE, size: 12 } },
      children: [new TextRun({ text: (c.jenisLkpd || 'LKPD').toUpperCase(), bold: true, size: 19, color: '047857', font: 'Calibri' })],
    })
  );

  // Kotak Identitas Siswa
  const idRows: [string, string, string, string][] = [
    ['Nama / Kelompok', '........................................', 'Mata Pelajaran', payload.subject || '-'],
    ['Kelas / Semester', `${c.identitasLkpd?.kelas || payload.grade} / ${c.identitasLkpd?.semester || payload.semester}`, 'Alokasi Waktu', c.identitasLkpd?.alokasiWaktu || payload.defaultDuration || formatJpDuration(2, payload.level, payload.grade)],
    ['Hari / Tanggal', '........................................', 'Tahun Pelajaran', payload.academicYear || '-'],
  ];

  children.push(
    new Table({
      width: { size: 9638, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [1900, 2919, 1900, 2919],
      rows: idRows.map(
        ([k1, v1, k2, v2]) =>
          new TableRow({
            children: [
              new TableCell({ width: { size: 1900, type: WidthType.DXA }, shading: { fill: 'F1F5F9' }, borders: cellBorders, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: k1, bold: true, size: 18, font: 'Calibri' })] })] }),
              new TableCell({ width: { size: 2919, type: WidthType.DXA }, borders: cellBorders, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: v1, size: 18, font: 'Calibri' })] })] }),
              new TableCell({ width: { size: 1900, type: WidthType.DXA }, shading: { fill: 'F1F5F9' }, borders: cellBorders, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: k2, bold: true, size: 18, font: 'Calibri' })] })] }),
              new TableCell({ width: { size: 2919, type: WidthType.DXA }, borders: cellBorders, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: v2, size: 18, font: 'Calibri' })] })] }),
            ],
          })
      ),
    })
  );

  const addSectionBanner = (num: number, title: string) => {
    children.push(
      new Paragraph({ spacing: { before: 180, after: 80 }, children: [] }),
      new Table({
        width: { size: 9638, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        columnWidths: [9638],
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 9638, type: WidthType.DXA },
                shading: sectionShade,
                borders: { top: { style: BorderStyle.SINGLE, size: 4, color: 'A7F3D0' }, bottom: { style: BorderStyle.SINGLE, size: 4, color: 'A7F3D0' }, left: { style: BorderStyle.SINGLE, size: 12, color: '047857' }, right: { style: BorderStyle.SINGLE, size: 4, color: 'A7F3D0' } },
                margins: { top: 70, bottom: 70, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: `${num}. ${title}`, bold: true, size: 20, color: '064E3B', font: 'Calibri' })] })],
              }),
            ],
          }),
        ],
      })
    );
  };

  const addBodyPara = (text: string, boldLabel?: string) => {
    if (!text) return;
    const runs: TextRun[] = [];
    if (boldLabel) runs.push(new TextRun({ text: `${boldLabel} `, bold: true, size: 19, font: 'Calibri' }));
    runs.push(new TextRun({ text, size: 19, font: 'Calibri' }));
    children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 80, after: 60 }, children: runs }));
  };

  // 1. Judul
  addSectionBanner(1, 'Judul Kegiatan');
  addBodyPara(c.judulKegiatan || payload.title, 'Judul:');
  addBodyPara(`${c.identitasLkpd?.topik || payload.title}${c.identitasLkpd?.subtema ? ` — ${c.identitasLkpd.subtema}` : ''}`, 'Topik / Subtema:');

  // 2. Petunjuk Belajar
  addSectionBanner(2, 'Petunjuk Belajar');
  (c.petunjukPengerjaan || []).forEach((s, i) => addBodyPara(`${i + 1}. ${s}`));

  // 3. Kompetensi / Tujuan Pembelajaran
  addSectionBanner(3, 'Kompetensi / Tujuan Pembelajaran');
  if (c.capaianKompetensi) addBodyPara(c.capaianKompetensi, 'Capaian Kompetensi:');
  addBodyPara(c.tujuan || '-', 'Tujuan Pembelajaran:');
  if (c.petaKebutuhan) addBodyPara(c.petaKebutuhan, 'Posisi Unit Belajar:');

  // 4. Informasi Pendukung
  addSectionBanner(4, 'Informasi Pendukung');
  addBodyPara(c.materiSingkat || '-');
  if (c.alatDanBahan && c.alatDanBahan.length > 0) addBodyPara(c.alatDanBahan.join(', '), 'Alat & Bahan:');

  // 5. Tugas & Langkah Kerja
  addSectionBanner(5, 'Tugas & Langkah Kerja');
  if (c.aktivitasUtama) addBodyPara(c.aktivitasUtama, 'Aktivitas Utama:');
  (c.langkahKegiatan || []).forEach((s, i) => addBodyPara(`${i + 1}. ${s}`));

  if (c.kolomTabelPengamatan && c.kolomTabelPengamatan.length > 0) {
    const colW = Math.floor(9638 / c.kolomTabelPengamatan.length);
    const widths = c.kolomTabelPengamatan.map(() => colW);
    children.push(
      new Paragraph({ spacing: { before: 80 }, children: [] }),
      new Table({
        width: { size: 9638, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        columnWidths: widths,
        rows: [
          new TableRow({
            tableHeader: true,
            children: c.kolomTabelPengamatan.map((h) => new TableCell({ width: { size: colW, type: WidthType.DXA }, shading: headerShade, borders: cellBorders, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18, font: 'Calibri' })] })] })),
          }),
          ...[0, 1, 2].map(() => new TableRow({
            children: c.kolomTabelPengamatan!.map(() => new TableCell({ width: { size: colW, type: WidthType.DXA }, borders: cellBorders, margins: { top: 140, bottom: 140, left: 80, right: 80 }, children: [new Paragraph({ children: [] })] })),
          })),
        ],
      })
    );
  }

  if (c.pertanyaanPemahaman && c.pertanyaanPemahaman.length > 0) {
    addBodyPara('', 'Pertanyaan Pemahaman:');
    c.pertanyaanPemahaman.forEach((q, i) => {
      addBodyPara(`${i + 1}. ${q}`);
      addBodyPara('Jawaban: ________________________________________________________________________');
    });
  }
  if (c.tugasPraktik) addBodyPara(c.tugasPraktik, 'Tugas Praktik:');
  if (c.panduanKesimpulan) addBodyPara(c.panduanKesimpulan, 'Kesimpulan:');

  // 6. Penilaian & Refleksi
  addSectionBanner(6, 'Penilaian (PAP) & Refleksi');
  if (c.soalSingkatPenilaian && c.soalSingkatPenilaian.length > 0) {
    addBodyPara('', 'Soal Evaluasi Singkat:');
    c.soalSingkatPenilaian.forEach((s, i) => addBodyPara(`${i + 1}. ${s.soal} (Skor Maks: ${s.skorMaksimal})`));
  }
  if (c.refleksi && c.refleksi.length > 0) {
    addBodyPara('', 'Refleksi Peserta Didik:');
    c.refleksi.forEach((r, i) => addBodyPara(`${i + 1}. ${r}`));
  }

  if (c.rubrikPenilaian && c.rubrikPenilaian.length > 0) {
    const rWidths = [2400, 4438, 1300, 1500];
    const totalSkor = c.rubrikPenilaian.reduce((acc, r) => acc + Number(r.skorMaksimal || 0), 0);
    children.push(
      new Paragraph({ spacing: { before: 100 }, children: [] }),
      new Table({
        width: { size: 9638, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        columnWidths: rWidths,
        rows: [
          new TableRow({
            tableHeader: true,
            children: ['Aspek Penilaian', 'Kriteria Pencapaian', 'Skor Maks', 'Skor Siswa'].map((t, idx) =>
              new TableCell({ width: { size: rWidths[idx], type: WidthType.DXA }, shading: headerShade, borders: cellBorders, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 18, font: 'Calibri' })] })] })
            ),
          }),
          ...c.rubrikPenilaian.map((r) => new TableRow({
            children: [
              new TableCell({ width: { size: rWidths[0], type: WidthType.DXA }, borders: cellBorders, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: r.aspek, size: 18, font: 'Calibri' })] })] }),
              new TableCell({ width: { size: rWidths[1], type: WidthType.DXA }, borders: cellBorders, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: r.kriteria, size: 18, font: 'Calibri' })] })] }),
              new TableCell({ width: { size: rWidths[2], type: WidthType.DXA }, borders: cellBorders, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(r.skorMaksimal), size: 18, font: 'Calibri' })] })] }),
              new TableCell({ width: { size: rWidths[3], type: WidthType.DXA }, borders: cellBorders, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [] })] }),
            ],
          })),
          new TableRow({
            children: [
              new TableCell({ width: { size: 6838, type: WidthType.DXA }, columnSpan: 2, borders: cellBorders, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Total Skor / Nilai Akhir', bold: true, size: 18, font: 'Calibri' })] })] }),
              new TableCell({ width: { size: 1300, type: WidthType.DXA }, borders: cellBorders, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(totalSkor), bold: true, size: 18, font: 'Calibri' })] })] }),
              new TableCell({ width: { size: 1500, type: WidthType.DXA }, borders: cellBorders, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [] })] }),
            ],
          }),
        ],
      })
    );
  }

  const docxDoc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 960, right: 1134, bottom: 960, left: 1134 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: `${schoolName} | ${payload.subject} ${payload.grade}`, size: 17, color: '94A3B8', font: 'Calibri' })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(docxDoc);
  downloadBlob(blob, payload.fileName.endsWith('.docx') ? payload.fileName : `${payload.fileName}.docx`);
}

export function exportTextbookPdf(book: TextbookRecord) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(book.title || 'Buku Referensi Pembelajaran', margin, y, { maxWidth: pageWidth - margin * 2 });
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  const metaLines = [
    `Mata Pelajaran: ${book.subject || '-'}`,
    `Jenjang / Kelas: ${book.level || '-'} · ${book.grade || '-'}`,
    `Kurikulum: ${book.curriculum || '-'}`,
    `Penulis: ${book.author || '-'}`,
    `Penerbit: ${book.publisher || '-'} (${book.publishYear || '2024'})`,
    book.isbn ? `ISBN: ${book.isbn}` : '',
    book.sourceUrl ? `Link Sumber: ${book.sourceUrl}` : '',
  ].filter(Boolean);

  metaLines.forEach((line) => {
    doc.text(line, margin, y);
    y += 6;
  });

  y += 6;

  if (book.extractedSummary) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 58, 138);
    doc.text('Ringkasan Isi Buku', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    const splitSummary = doc.splitTextToSize(book.extractedSummary, pageWidth - margin * 2);
    doc.text(splitSummary, margin, y);
    y += splitSummary.length * 5 + 8;
  }

  if (Array.isArray(book.chapters) && book.chapters.length > 0) {
    if (y > pageHeight - 40) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 58, 138);
    doc.text('Daftar Bab & Struktur Materi', margin, y);
    y += 6;

    const tableRows = book.chapters.map((c, i) => [
      c.chapterNumber || `Bab ${i + 1}`,
      c.title || '-',
      Array.isArray(c.subchapters) ? c.subchapters.join(', ') : '-',
      c.recommendedSemester || '-',
      c.summary || '-',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Bab', 'Judul Bab', 'Subbab Materi', 'Semester', 'Ringkasan']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8.5, textColor: [15, 23, 42] },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 35 },
        2: { cellWidth: 45 },
        3: { cellWidth: 22 },
        4: { cellWidth: 60 },
      },
      margin: { left: margin, right: margin },
    });
  }

  const cleanTitle = (book.title || 'Buku_Referensi').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
  doc.save(`${cleanTitle}.pdf`);
}


