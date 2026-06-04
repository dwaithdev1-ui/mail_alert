interface KeywordMap {
  [key: string]: string[];
}

const DEPARTMENT_KEYWORDS: KeywordMap = {
  // Corporate
  'HR': ['hr', 'human resources', 'recruitment', 'onboarding', 'payroll', 'benefits', 'interview', 'talent'],
  'IT': ['it', 'tech', 'support', 'outage', 'server', 'network', 'security', 'software', 'hardware', 'engineering', 'devops', 'helpdesk'],
  'Finance': ['finance', 'budget', 'expense', 'invoice', 'accounting', 'audit', 'tax', 'billing', 'accounts'],
  'Operations': ['ops', 'operations', 'logistics', 'supply chain', 'facilities', 'maintenance'],
  'Sales & Marketing': ['sales', 'marketing', 'seo', 'campaign', 'lead', 'prospect', 'advertising', 'social media', 'pr', 'communications'],
  'Legal': ['legal', 'compliance', 'contract', 'nda', 'lawyer', 'attorney', 'litigation'],
  'Administration': ['admin', 'executive', 'board', 'management', 'planning', 'assistant'],
  
  // Banking / Financial
  'Retail Banking': ['retail banking', 'branch', 'teller'],
  'Corporate Banking': ['corporate banking', 'commercial banking', 'b2b'],
  'Investment': ['investment', 'wealth management', 'portfolio', 'trading', 'equities'],
  'Risk & Compliance': ['risk', 'compliance', 'aml', 'kyc', 'regulatory'],
  'Loans & Mortgages': ['loan', 'mortgage', 'underwriting', 'lending', 'credit'],
  'Treasury': ['treasury', 'liquidity', 'capital'],
  'Fraud': ['fraud', 'investigation', 'dispute'],

  // College / University
  'Admissions': ['admissions', 'enrollment', 'application'],
  'Financial Aid': ['financial aid', 'scholarship', 'grant', 'fafsa'],
  'Registrar': ['registrar', 'records', 'transcript'],
  'Alumni': ['alumni', 'endowment', 'donation'],
  'Faculty': ['faculty', 'professor', 'lecturer', 'dean', 'academic'],
  'Student Affairs': ['student affairs', 'student life', 'extracurricular'],
  'Athletics': ['athletics', 'sports', 'coach', 'ncaa'],
  'Library': ['library', 'librarian', 'archives'],
  'Housing': ['housing', 'residence', 'dormitory'],
  'Career Services': ['career services', 'internship', 'placement'],
  'Bursar': ['bursar', 'tuition', 'student accounts']
};

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Automatically categorize an email into a department dynamically.
 */
export function detectDepartment(sender: string, subject: string, snippet: string): string {
  // 1. Check for explicit tags in subject like [HR] or (Finance)
  const tagMatch = subject.match(/^\[(.*?)\]|^\((.*?)\)/);
  if (tagMatch) {
    const tag = (tagMatch[1] || tagMatch[2]).trim();
    if (tag.length > 1 && tag.length < 20) {
      return capitalize(tag);
    }
  }

  // 2. Check sender name for explicit department structures (e.g. "HR Team", "IT Department")
  const senderNameMatch = sender.match(/^(.+?)\s+(Team|Department|Dept|Support|Group|Office|Division)$/i);
  if (senderNameMatch) {
    return capitalize(senderNameMatch[1].trim());
  }

  // 3. Fallback to keyword matching in mail-id (sender) and subject ONLY
  const combinedText = `${sender} ${subject}`.toLowerCase();
  for (const [dept, keywords] of Object.entries(DEPARTMENT_KEYWORDS)) {
    for (const kw of keywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(combinedText)) {
        return dept;
      }
    }
  }

  // 4. Default if nothing can be dynamically determined
  return 'General';
}
