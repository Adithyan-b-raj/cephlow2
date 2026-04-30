export interface SendEmailJobData {
  batchId: string;
  userId: string;
  subject: string;
  body: string;
  /** If set, send only this single cert instead of the whole batch */
  certId?: string;
}

export interface SendWhatsAppJobData {
  batchId: string;
  userId: string;
  var1Template?: string;
  var2Template?: string;
  var3Template?: string;
}

export interface R2UploadJobData {
  certId: string;
  batchId: string;
  recipientName: string;
  recipientEmail: string;
  batchName: string;
  pdfBase64: string;
  rowData: Record<string, string>;
  /** Drive file info passed through from client (optional) */
  drivePdfFileId?: string | null;
  drivePdfUrl?: string | null;
  driveSlideFileId?: string | null;
  driveSlideUrl?: string | null;
}
