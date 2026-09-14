export function staticAnalysisResult(report, exitCode, output) {
  const incomplete =
    /Failed to resolve|Failed to resolved|Missing inheritance|Missing params|Traceback/.test(
      output,
    );
  const findings = report.results?.detectors;
  if (!Array.isArray(findings)) throw new Error("Static analyzer omitted detector results");
  const impacts = {};
  for (const finding of findings) {
    if (!["High", "Medium", "Low", "Informational", "Optimization"].includes(finding.impact))
      throw new Error("Unknown static-analysis severity");
    impacts[finding.impact] = (impacts[finding.impact] ?? 0) + 1;
  }
  const passed =
    exitCode === 0 &&
    report.success === true &&
    !incomplete &&
    (impacts.High ?? 0) === 0 &&
    (impacts.Medium ?? 0) === 0;
  return { passed, exitCode, incomplete, impacts };
}
