export const memberPasswordHint='密码需为6–128位，同时包含大写字母、小写字母和特殊字符（如 !、@、#），数字可选';
// Printable ASCII punctuation counts as a special character; spaces, digits
// and non-Latin letters do not substitute for one of the required classes.
export const memberPasswordPattern='(?=[\\s\\S]*[A-Z])(?=[\\s\\S]*[a-z])(?=[\\s\\S]*[\\x21-\\x2F\\x3A-\\x40\\x5B-\\x60\\x7B-\\x7E])[\\s\\S]{6,128}';
const rule=new RegExp(`^(?:${memberPasswordPattern})$`,'u');
export const validMemberPassword=value=>typeof value==='string'&&value.length>=6&&value.length<=128&&rule.test(value);
