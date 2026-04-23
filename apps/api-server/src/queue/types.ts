export interface GenerateJobData {
  batchId: string;
  userId: string;
  certIds: string[];
  baseUrl: string;
}

export interface SendEmailJobData {
  batchId: string;
  userId: string;
  subject: string;
  body: string;
}

export interface SendWhatsAppJobData {
  batchId: string;
  userId: string;
  var1Template?: string;
  var2Template?: string;
  var3Template?: string;
}
