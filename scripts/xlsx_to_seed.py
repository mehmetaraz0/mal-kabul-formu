import openpyxl
import sys

SRC = r"C:\Users\mta-1\Desktop\Firma_Isim_Listesi (1).xlsx"
OUT = "supabase/seed/seed_companies.sql"

wb = openpyxl.load_workbook(SRC, data_only=True)
ws = wb["Firma Listesi"]

lines = ["-- seed_companies.sql (xlsx_to_seed.py tarafından üretildi)", "insert into companies (sira_no, name) values"]
rows = []
for sira_no, name, _ in ws.iter_rows(min_row=2, values_only=True):
    if name is None:
        continue
    clean_name = str(name).strip().replace("'", "''")
    rows.append(f"  ({int(sira_no)}, '{clean_name}')")

lines.append(",\n".join(rows) + "\non conflict (name) do nothing;")

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"{len(rows)} firma yazıldı -> {OUT}")
