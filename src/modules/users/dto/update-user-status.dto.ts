import { IsEnum } from 'class-validator';
import { Status } from 'src/generated/prisma/enums';

export class UpdateUserStatusDto {
  @IsEnum(Status)
  status!: Status;
}
