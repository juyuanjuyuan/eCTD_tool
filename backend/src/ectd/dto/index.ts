import { IsString } from 'class-validator';

// NOTE: Plan 12 — SaveStfDto removed. v2 study DTOs are defined in
// `backend/src/study/dto/` and shipped with StudyModule.

export class ValidateOperationDto {
  @IsString()
  operation: string; // NEW, REPLACE, APPEND, DELETE
}
