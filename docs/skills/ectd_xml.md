# eCTD XML 骨架文件生成

## 1. 概述

eCTD 申报资料包含两个骨架 XML 文件:
- **index.xml** — ICH 骨架文件（模块二至五的目录结构）
- **cn-regional.xml** — 区域骨架文件（模块一的目录结构）

以及一个校验文件:
- **index-md5.txt** — 骨架文件的 MD5 校验值

## 2. 安装依赖

```bash
npm install fast-xml-parser
```

## 3. index.xml 生成

### 3.1 XML 结构

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">
<?xml-stylesheet type="text/xsl" href="util/style/ectd-2-0.xsl"?>
<ectd:ectd xmlns:ectd="http://www.ich.org/ectd"
           xmlns:xlink="http://www.w3.org/1999/xlink">

  <!-- 模块二: 通用技术文档总结 -->
  <m2-common-technical-document-summaries>
    <m2-22-intro>
      <leaf ID="N12345..." operation="new"
            xlink:href="m2/22-intro/introduction.pdf"
            checksum="a1b2c3d4..."
            checksum-type="MD5">
        <title>引言</title>
      </leaf>
    </m2-22-intro>
    <!-- ... -->
  </m2-common-technical-document-summaries>

  <!-- 模块三: 质量 -->
  <m3-quality>
    <!-- ... -->
  </m3-quality>

  <!-- 模块四: 非临床试验报告 -->
  <m4-nonclinical-study-reports>
    <!-- ... -->
  </m4-nonclinical-study-reports>

  <!-- 模块五: 临床研究报告 -->
  <m5-clinical-study-reports>
    <!-- ... -->
  </m5-clinical-study-reports>

</ectd:ectd>
```

### 3.2 生成服务

```typescript
// ectd/xml-backbone.service.ts
import { Injectable } from '@nestjs/common';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import * as crypto from 'crypto';
import * as fs from 'fs';

@Injectable()
export class XmlBackboneService {

  /**
   * 生成 index.xml (ICH 骨架文件)
   */
  async generateIndexXml(sequence: SequenceWithNodes): Promise<string> {
    const builder = new XMLBuilder({
      format: true,
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      suppressBooleanAttributes: false,
    });

    const xmlObj = {
      '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
      'ectd:ectd': {
        '@_xmlns:ectd': 'http://www.ich.org/ectd',
        '@_xmlns:xlink': 'http://www.w3.org/1999/xlink',
        // 模块二
        'm2-common-technical-document-summaries': this.buildModule2(sequence),
        // 模块三
        'm3-quality': this.buildModule3(sequence),
        // 模块四
        'm4-nonclinical-study-reports': this.buildModule4(sequence),
        // 模块五
        'm5-clinical-study-reports': this.buildModule5(sequence),
      },
    };

    let xml = builder.build(xmlObj);

    // 添加 DTD 声明和样式表引用（XMLBuilder 不直接支持）
    xml = xml.replace(
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">\n' +
      '<?xml-stylesheet type="text/xsl" href="util/style/ectd-2-0.xsl"?>'
    );

    return xml;
  }

  /**
   * 构建叶元素
   */
  private buildLeaf(node: SequenceNodeWithFile): any {
    const leaf: any = {
      '@_ID': this.generateLeafId(),
      '@_operation': node.operation, // new/replace/append/delete
      '@_checksum-type': 'MD5',
    };

    // delete 操作不包含 xlink:href
    if (node.operation !== 'delete') {
      leaf['@_xlink:href'] = node.file.storagePath; // 相对路径
      leaf['@_checksum'] = node.file.md5Checksum;
    }

    // replace/append/delete 需要 modified-file
    if (node.operation !== 'new') {
      leaf['@_modified-file'] = node.previousFile?.storagePath;
    }

    leaf['title'] = node.title;

    return { leaf };
  }

  /**
   * 生成叶元素 ID
   * 规则: 不以数字开头的唯一标识符
   */
  private generateLeafId(): string {
    const uuid = crypto.randomUUID();
    return `N${uuid.replace(/-/g, '')}`;
  }
}
```

## 4. cn-regional.xml 生成

```xml
<?xml version="1.0" encoding="UTF-8"?>
<cn-regional:cn-regional
  xmlns:cn-regional="http://www.nmpa.gov.cn/cn-regional"
  xmlns:xlink="http://www.w3.org/1999/xlink">

  <!-- 信封信息 -->
  <admin-info>
    <applicant-info>
      <application-number>x202112345</application-number>
      <application-type>新药申请</application-type>
      <product-type>化学药品</product-type>
      <original-number>2021123456</original-number>
    </applicant-info>
    <regulatory-activity>
      <regulatory-activity-type>首次申请</regulatory-activity-type>
      <related-sequence>0000</related-sequence>
    </regulatory-activity>
    <sequence-info>
      <sequence-number>0000</sequence-number>
      <sequence-type>首次提交</sequence-type>
      <sequence-description>xx新药上市申请</sequence-description>
      <contact>
        <name>张三</name>
        <phone>13800138000</phone>
        <email>zhangsan@example.com</email>
      </contact>
    </sequence-info>
  </admin-info>

  <!-- 模块一目录 -->
  <m1-administrative-information-and-prescribing-information>
    <cn-1-0>
      <leaf ID="N..." operation="new" xlink:href="m1/cn/00/cover-letter.pdf"
            checksum="..." checksum-type="MD5">
        <title>说明函</title>
      </leaf>
    </cn-1-0>
    <!-- cn-1-2 到 cn-1-12 -->
  </m1-administrative-information-and-prescribing-information>

</cn-regional:cn-regional>
```

## 5. MD5 校验

```typescript
// ectd/md5-checksum.service.ts
import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';

@Injectable()
export class Md5ChecksumService {

  /**
   * 计算文件的 MD5 值
   */
  calculateFileMd5(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * 计算字符串内容的 MD5 值
   */
  calculateStringMd5(content: string): string {
    return crypto.createHash('md5').update(content, 'utf8').digest('hex');
  }

  /**
   * 生成 index-md5.txt
   * 格式: <md5值> <文件名>
   */
  generateIndexMd5Txt(indexXml: string, cnRegionalXml: string): string {
    const indexMd5 = this.calculateStringMd5(indexXml);
    const cnRegionalMd5 = this.calculateStringMd5(cnRegionalXml);
    return `${indexMd5} index.xml\n${cnRegionalMd5} cn-regional.xml`;
  }

  /**
   * 验证 MD5 值是否一致
   */
  verifyChecksum(filePath: string, expectedMd5: string): boolean {
    const actualMd5 = this.calculateFileMd5(filePath);
    return actualMd5.toLowerCase() === expectedMd5.toLowerCase();
  }
}
```

## 6. util 文件夹

eCTD 提交包的 util 文件夹必须包含以下文件:

```
util/
├── dtd/
│   ├── cn-regional-1-0.xsd
│   ├── xlink.xsd
│   ├── xml.xsd
│   ├── ich-ectd-3-2.dtd
│   └── ich-stf-v2-2.dtd
└── style/
    ├── ectd-2-0.xsl
    ├── cn-regional-1-1.xsl
    ├── ich-stf-stylesheet-2-3.xsl
    ├── ich-stf-stylesheet-2-2a.xsl
    └── valid-values.xml
```

这些文件从 `reference/eCTD技术规范V1.1附件包/` 获取，checksum 必须与 NMPA 发布的值一致。

## 7. 文件命名规范

```typescript
/**
 * eCTD 文件命名规则 (技术规范 3.3.2):
 * - 仅允许小写字母 a-z, 数字 0-9, 连字符 -
 * - 不允许空格、下划线、中文字符
 * - 文件和文件夹名称总长度不超过 180 字符
 * - 路径仅使用正斜杠 /
 */
function normalizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')  // 非法字符替换为连字符
    .replace(/-+/g, '-')           // 合并连续连字符
    .replace(/^-|-$/g, '');        // 去除首尾连字符
}
```
