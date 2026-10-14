# Álbuns → Criar relatório fotográfico

Integrated into the existing static app. No new application, bucket, or photo upload.

- `report.js`: authorized album selection, original storage downloads, independent report captions, selection and order, save/reopen, A4 preview and PDF download.
- `report-core.js`: shared pagination for 1, 2, 4, 6, 9 or 16 images. A layout change starts a new page; consecutive photos with the same layout share that page up to its capacity.
- `report-schema.sql`: applied as Supabase migration `album_photographic_reports`. Reuses the two report tables; adds `album_id` to identify the source. The save RPC is SECURITY INVOKER, validates album membership, and saves header and items in one transaction. Existing SELECT policies remain; new write policies use the existing administrator role. No anonymous report access or service key.
- `assets/lauda-relatorio.jpg`: exact original user attachment, SHA256 `d2eca0f27bf0e8e687609937759199bce00e7b5f55d3f36fc198cc6e5925ffd5`. Full page, without cropping or rebuilding its footer. Content stops above the footer.
- `assets/jspdf.umd.min.js`: jsPDF 4.2.1, locally bundled with MIT license. No remote PDF service. PDF pages render at 2480 × 3508 pixels (300 dpi) from the original image downloads and shared preview geometry. Photos fit within their cells without cropping. Text is rasterized; the exported PDF is not searchable. Long captions that would leave insufficient image space block export with an actionable message.

## Access

Enter with the existing Google login through the header avatar, then open Álbuns. Saving/reopening reports currently follows the existing administrator-only report model. Other authorized roles retain their previous access; expanding report access requires a deliberate role policy change.

Demo albums retain their existing illustrative reference URLs and display a demo notice. Professional images are downloaded from the existing private storage bucket using the current user session. Blob URLs are temporary and revoked on close/sign-out. The report writes only photograph references and presentation fields; it never updates album photographs.

## Verification

Run `node tests/report-core.test.cjs`. Covers all six layouts, mixed pages, exclusions, order and source immutability.

Database checks were executed in rollback transactions against the authenticated administrator role: insert, update, reference count and original caption isolation. An unapproved authenticated account and the anonymous role were tested for denied read/write. The new save function was verified to be SECURITY INVOKER. Security advisors were inspected; their remaining notices concern pre-existing demo RPCs and other tables/auth settings.

Local browser tests use a fixture outside the published app. Checked selection, order, caption edits, save/reopen, mixed layouts, PDF export, actual A4 page dimensions and visual footer preservation. Google OAuth code was preserved; a fresh OAuth roundtrip and real professional album workflow still require the user's authorized browser session.
