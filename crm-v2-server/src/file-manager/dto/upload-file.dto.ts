import { IsIn, IsUUID } from 'class-validator';
import { FILE_ENTITY_TYPES, type FileEntityType } from '../constants/providers';

export class UploadFileDto {
  @IsIn(FILE_ENTITY_TYPES)
  entity_type: FileEntityType;

  @IsUUID()
  entity_id: string;
}
