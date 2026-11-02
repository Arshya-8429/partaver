# PartAvar operational app design

Implementation authorized by the user's instruction to execute the master pack. Extend the already reviewed compact Persian RTL blue/neutral design, rather than replacing its working search architecture. This document is the concrete integration design used during execution.

- Route /app is the work surface; the public website owns / and product/support routes. Text-only PartAvar / پارت‌آور wordmark; no invented logo.
- Compact wrapping navigation: Search, Purchase Lists, Packages, Invoices, Price Intelligence, Settings. Search stays one click away. No fabricated dashboard metrics.
- Search retains vehicle/name and global/code modes. Replace native datalist with a labelled custom combobox/listbox, 180ms guarded suggestions, immediate Enter, input search/autocorrect/autocomplete attributes and safe keyboard dismissal. All actual preferred/other models remain reachable.
- Each entry retains its own complete technical/logistics codes, three prices and fitment summary. Add invoice/purchase/related actions and compact neutral-or-real-history badge. Secondary package action may be in details; no shared family price.
- A bounded inline related panel shows 2–5 configured target groups, each with real version-pinned entry choices. Ambiguous logistics entries require explicit selection; unavailable vehicle-scoped suggestions never fall back to all vehicles. No-reliable-suggestion is explicit.
- Document workspaces use compact editable lines rather than wide mobile tables. Price/quantity edits are direct; mode/custom price selection snapshots values. Saved documents never reprice on catalogue activation. Package transfer retains chosen logistics identity, manual price and quantity. Destructive clear/delete asks confirmation.
- Separate persistent browser document database, explicit portable/legacy import with validation and confirmation, and clear origin/device-local limits. Dedicated A4 print surface and true XLSX download; no popups or invented tax fields.
- History summary page is bounded and may filter/sort real imported observations. Entry badges load only summaries for the visible page; timelines are lazy. Gray means no sufficient trusted dated history. Imported history never changes current catalogue prices.
- Operator settings expose default package tier and domain classification configuration, backup/import and catalogue readiness. File imports remain local CLI until proper server admin auth exists.
- Light/dark cover all new states; 44px hit areas, 16px mobile inputs, visible focus, isolated LTR codes/money, safe wrapping, reduced motion. Verify 320/360/390/430/768/1024/1440 and print separately.

Skill provenance and real verification are recorded in final-design-review.md and verification-report.md. Physical Android/software keyboard and assistive technology cannot be inferred from desktop emulation.
