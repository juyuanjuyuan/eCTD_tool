// Embedded public key used to verify license codes signed by `tools/issue-license/issue-license.js`.
// Build-time inline is intentional: the desktop binary should not perform runtime file I/O for the public key.
// If the key pair is rotated, replace this constant in the same commit as the new private key in `tools/keys/`.

export const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA56H9267QNfUkAqy4XrBF
Um4IxxOJ8i71Vw/0wbIGixEBlmk1oAy2sUU+HVzPA/gyLozgsACRh452yA26Zonn
0eeOqeQ2sfsJr089sMCsbocz9fm7BCTUEhjG1HRior3H/IafbZN4XE5kqq8wnFPu
aK6nOHX/y1jPPf04NTY6KEiQYLz69wJ2TCmekRdNK6aHdjxkFjlAbJuxOYDj4bnu
nJ0IHpPeY83phzBQ6oqK1Ba4Z2UwPwN4Owl71m+HnZP4VQj/rt0zZoRf3pqCjo2C
nUzmoDax/+sEnD8b/ilRVfdSDCipNSZNbUTr7rcyz0g73FVJ3PNppuRXPZInlG0j
DQIDAQAB
-----END PUBLIC KEY-----
`;
