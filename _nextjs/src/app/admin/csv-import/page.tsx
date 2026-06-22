"use client";

import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

const TEMPLATE_COLUMNS = [
  { key: "name",          label: "Name",           required: true },
  { key: "sku",           label: "SKU",            required: false },
  { key: "description",   label: "Description",    required: false },
  { key: "price",         label: "Price",          required: true },
  { key: "sale_price",    label: "Sale Price",     required: false },
  { key: "is_on_sale",    label: "Is On Sale",     required: false },
  { key: "category_name", label: "Category",       required: false },
  { key: "case_qty",      label: "Case Qty",       required: false },
  { key: "pack_size",     label: "Pack Size",      required: false },
  { key: "unit",          label: "Unit",           required: false },
  { key: "is_featured",   label: "Is Featured",    required: false },
  { key: "is_active",     label: "Is Active",      required: false },
  { key: "image_url",     label: "Image URL",      required: false },
  { key: "stock_qty",     label: "Stock Qty",      required: false },
  { key: "stock_status",  label: "Stock Status",   required: false },
];

type Step = 1 | 2 | 3;
type Mapping = Record<string, string>; // templateKey -> sourceColumn

function autoMap(sourceColumns: string[]): Mapping {
  const mapping: Mapping = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-\/]+/g, "");
  const aliases: Record<string, string[]> = {
    name:          ["name","productname","title","item"],
    sku:           ["sku","skucode","itemcode","code","partnumber","id"],
    description:   ["description","desc","details","info","notes"],
    price:         ["price","cost","caseprice","unitprice","msrp"],
    sale_price:    ["saleprice","discountprice","specialprice"],
    is_on_sale:    ["isonsale","onsale","sale","discount"],
    category_name: ["category","categoryname","dept","department","type","producttype"],
    case_qty:      ["caseqty","casecount","quantitypercase","casesize"],
    pack_size:     ["packsize","pack","packs","packcount"],
    unit:          ["unit","uom","unitofmeasure"],
    is_featured:   ["isfeatured","featured","highlight"],
    is_active:     ["isactive","active","status","enabled"],
    image_url:     ["imageurl","image","img","photo","picture","url"],
    stock_qty:     ["stockqty","stock","quantity","qty","inventory"],
    stock_status:  ["stockstatus","availability","instock"],
  };

  for (const col of sourceColumns) {
    const norm = normalize(col);
    for (const [templateKey, aliasList] of Object.entries(aliases)) {
      if (aliasList.some((a) => norm === a || norm.includes(a)) && !mapping[templateKey]) {
        mapping[templateKey] = col;
        break;
      }
    }
  }
  return mapping;
}

function rowsToCSV(rows: Record<string, string>[]): string {
  const BOM = "﻿";
  const headers = TEMPLATE_COLUMNS.map((c) => c.key);
  const lines = [headers.join(",")];
  for (const row of rows) {
    const vals = headers.map((h) => {
      const v = row[h] ?? "";
      return `"${String(v).replace(/"/g, '""')}"`;
    });
    lines.push(vals.join(","));
  }
  return BOM + lines.join("\r\n");
}

export default function CsvImportPage() {
  const [step, setStep] = useState<Step>(1);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [sourceColumns, setSourceColumns] = useState<string[]>([]);
  const [sourceRows, setSourceRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseFile = (file: File) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!json.length) return;
      const cols = Object.keys(json[0]);
      setSourceColumns(cols);
      setSourceRows(json);
      setRowCount(json.length);
      setMapping(autoMap(cols));
      setStep(2);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const buildPreview = () => {
    const rows = sourceRows.map((srcRow) => {
      const out: Record<string, string> = {};
      for (const col of TEMPLATE_COLUMNS) {
        const srcCol = mapping[col.key] ?? "";
        out[col.key] = srcCol ? String(srcRow[srcCol] ?? "") : "";
      }
      return out;
    });
    setPreviewRows(rows);
    setStep(3);
  };

  const downloadCSV = () => {
    const csv = rowsToCSV(previewRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rrs_products_import.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStep(1);
    setFileName("");
    setSourceColumns([]);
    setSourceRows([]);
    setMapping({});
    setPreviewRows([]);
    setRowCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const mappedCount = TEMPLATE_COLUMNS.filter((c) => mapping[c.key]).length;

  return (
    <main className="dashboard-content">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "28px" }}>
        <h1 className="dashboard-title" style={{ margin: 0 }}>CSV Import Converter</h1>
        {step > 1 && (
          <button onClick={reset} style={{ background: "none", border: "1px solid #d1d5db", borderRadius: "6px", padding: "8px 16px", fontSize: "13px", cursor: "pointer", color: "#555" }}>
            ↩ Start Over
          </button>
        )}
      </div>

      {/* Stepper */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: "32px" }}>
        {[
          { n: 1, label: "Upload File" },
          { n: 2, label: "Map Columns" },
          { n: 3, label: "Download CSV" },
        ].map((s, i) => (
          <div key={s.n} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: "700", fontSize: "14px",
                background: step === s.n ? "#f26f21" : step > s.n ? "#22c55e" : "#e5e7eb",
                color: step >= s.n ? "white" : "#888",
              }}>
                {step > s.n ? "✓" : s.n}
              </div>
              <span style={{ fontSize: "14px", fontWeight: step === s.n ? "700" : "500", color: step === s.n ? "#f26f21" : step > s.n ? "#22c55e" : "#aaa" }}>
                {s.label}
              </span>
            </div>
            {i < 2 && <div style={{ width: 80, height: 2, background: step > s.n ? "#22c55e" : "#e5e7eb", margin: "0 16px" }} />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="form-section-card">
          <h2>Upload your product file</h2>
          <p style={{ fontSize: "14px", color: "#555", marginBottom: "24px" }}>
            Drop any .xlsx or .csv file — you'll map its columns to the RRS template next.
          </p>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? "#f26f21" : "#d1d5db"}`,
              borderRadius: "12px",
              padding: "60px 24px",
              textAlign: "center",
              cursor: "pointer",
              background: dragging ? "#fff8f4" : "#fafafa",
              transition: "all 0.2s",
            }}
          >
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>📂</div>
            <p style={{ fontSize: "16px", fontWeight: "600", color: "#333", marginBottom: "6px" }}>Drop your .xlsx or .csv file here</p>
            <p style={{ fontSize: "13px", color: "#888" }}>or click to browse</p>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleFileChange} />
          </div>
        </div>
      )}

      {/* Step 2: Map Columns */}
      {step === 2 && (
        <div className="form-section-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
            <div>
              <h2 style={{ marginBottom: "4px" }}>Map Columns</h2>
              <p style={{ fontSize: "13px", color: "#888" }}>
                File: <strong>{fileName}</strong> · {rowCount} rows · {mappedCount}/{TEMPLATE_COLUMNS.length} columns mapped
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "28px" }}>
            {TEMPLATE_COLUMNS.map((col) => (
              <div key={col.key} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", background: "#f8f9fa", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "#0f2b50" }}>{col.label}</span>
                  {col.required && <span style={{ color: "#f26f21", marginLeft: "4px" }}>*</span>}
                  <div style={{ fontSize: "11px", color: "#aaa", fontFamily: "monospace" }}>{col.key}</div>
                </div>
                <select
                  value={mapping[col.key] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [col.key]: e.target.value })}
                  style={{ fontSize: "13px", border: "1px solid #d1d5db", borderRadius: "6px", padding: "6px 10px", background: "white", color: mapping[col.key] ? "#0f2b50" : "#aaa", minWidth: "160px" }}
                >
                  <option value="">— skip —</option>
                  {sourceColumns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <button onClick={buildPreview} className="submit-btn">
            Preview &amp; Generate CSV →
          </button>
        </div>
      )}

      {/* Step 3: Preview + Download */}
      {step === 3 && (
        <div>
          <div className="form-section-card" style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ marginBottom: "4px" }}>Ready to Download</h2>
                <p style={{ fontSize: "13px", color: "#888" }}>{previewRows.length} products converted to RRS format</p>
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={() => setStep(2)} style={{ border: "1px solid #d1d5db", background: "white", borderRadius: "6px", padding: "10px 20px", fontSize: "13px", cursor: "pointer" }}>
                  ← Edit Mapping
                </button>
                <button onClick={downloadCSV} className="submit-btn" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  ⬇ Download rrs_products_import.csv
                </button>
              </div>
            </div>
          </div>

          <div className="data-table">
            <h2>Preview (first 10 rows)</h2>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    {TEMPLATE_COLUMNS.map((c) => <th key={c.key} style={{ whiteSpace: "nowrap" }}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      {TEMPLATE_COLUMNS.map((c) => (
                        <td key={c.key} style={{ fontSize: "12px", whiteSpace: "nowrap", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {row[c.key] || <span style={{ color: "#ccc" }}>—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
