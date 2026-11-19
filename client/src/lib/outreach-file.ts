const MAX_CSV_BYTES = 1_000_000;
const MAX_WORKBOOK_BYTES = 5_000_000;

/**
 * Convert the first worksheet to CSV so every file type passes through the
 * same server-side contact validation and unsubscribe-preserving import.
 */
export async function readOutreachFile(file: Pick<File, "name" | "size" | "text" | "arrayBuffer">): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv") {
    if (file.size > MAX_CSV_BYTES) throw new Error("CSV must be smaller than 1 MB");
    return file.text();
  }
  if (extension !== "xls" && extension !== "xlsx") {
    throw new Error("Choose a CSV, XLS, or XLSX file");
  }
  if (file.size > MAX_WORKBOOK_BYTES) throw new Error("Excel file must be smaller than 5 MB");

  const XLSX = await import("@e965/xlsx");
  let workbook: ReturnType<typeof XLSX.read>;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  } catch {
    throw new Error("Could not read this Excel file. Check that it is a valid XLS or XLSX workbook.");
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The Excel file does not contain a worksheet");
  const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
  if (!csv.trim()) throw new Error("The first worksheet is empty");
  if (new TextEncoder().encode(csv).length > MAX_CSV_BYTES) {
    throw new Error("The first worksheet is too large to import (1 MB limit after conversion)");
  }
  return csv;
}