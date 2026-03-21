import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
} from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码至少6位' })
  password: string;

  @IsString()
  @IsNotEmpty({ message: '姓名不能为空' })
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;
}
