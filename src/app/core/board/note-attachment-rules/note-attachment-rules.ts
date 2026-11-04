export const MAX_NOTE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif'
]);

export const NOTE_ATTACHMENT_MIME_TYPES = [
  ...IMAGE_TYPES,
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
];

const ALLOWED_TYPES = new Set(NOTE_ATTACHMENT_MIME_TYPES);

export function isAllowedNoteAttachment(file: Pick<File, 'type' | 'size'>): boolean {
  return ALLOWED_TYPES.has(file.type) &&
    file.size > 0 &&
    file.size <= MAX_NOTE_ATTACHMENT_BYTES;
}
