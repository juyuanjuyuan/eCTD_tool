import { IsString, Matches } from 'class-validator';

export class CreateExtensionNodeDto {
  @IsString()
  @Matches(/^3\.2\.R\.[1-6]$/, {
    message: '扩展节点类型必须为 3.2.R.1 至 3.2.R.6',
  })
  extensionType: string; // e.g. "3.2.R.1"
}
