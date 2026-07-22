# Security Policy

## Scope

This policy covers **Ringside** — the Manipal Group internal M&A deal intelligence
platform. Ringside is an internal tool accessible only to authorised Manipal Group
employees. It is not a publicly available service.

## Reporting a Vulnerability

If you discover a security vulnerability in Ringside, please **do not** open a
public GitHub issue or discuss it in any shared channel.

**Contact the security team privately:**

| Channel | Address |
|---|---|
| Email | security@manipalgroup.info |
| Escalation | cto@manipalgroup.info |

Please include the following in your report:

- A clear description of the vulnerability and its potential impact
- Steps to reproduce the issue (proof-of-concept if possible)
- The version or commit where the issue was found
- Your name / employee ID (for internal coordination)

## Response Timeline

| Milestone | Target |
|---|---|
| Acknowledgement | Within 1 business day |
| Initial triage | Within 3 business days |
| Status update | Within 7 business days |
| Patch or mitigation | Dependent on severity — critical within 48 h |

## Embargo Policy

All reported vulnerabilities are treated as confidential and handled under a
**90-day embargo**. Manipal Group will coordinate disclosure timing with the
reporter before any public statement is made. For vulnerabilities in upstream
open-source dependencies, we follow the upstream project's responsible
disclosure process.

## Severity Classification

We use the [CVSS v3.1](https://www.first.org/cvss/v3.1/specification-document)
framework to classify severity:

| Rating | CVSS Score |
|---|---|
| Critical | 9.0 – 10.0 |
| High | 7.0 – 8.9 |
| Medium | 4.0 – 6.9 |
| Low | 0.1 – 3.9 |

Critical and High findings targeting production data or authentication are
treated as P0 incidents and trigger the Manipal Group incident response
playbook immediately upon triage.

## Dependency Vulnerabilities

Production dependency CVEs are tracked and patched on a rolling basis.
`pnpm audit --prod` is run as part of each release cycle. Critical and High
CVEs are remediated before release.

## Out of Scope

- Vulnerabilities in internal test or staging environments with no path to
  production data
- Social engineering or phishing attacks targeting Manipal Group employees
  (report to HR / InfoSec directly)
- Issues requiring physical access to Manipal Group facilities
