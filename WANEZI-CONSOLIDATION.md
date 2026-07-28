# Wanezi consolidation — plan and evidence

**Written 2026-07-28.** Prompted by Njabulo Mathwasa's payment not adding
up. It turned out not to be a payment problem.

## What is actually there

Wanezi High School exists **four times**. All four are the same school.

| id | name as stored | city | province | contacts | leads | invoices |
|---|---|---|---|---|---|---|
| `bb946992` | Wanezi High School | Wanezi | Matabeleland **North** | 2 | 2 | 0 |
| `5fa71762` | Wanezi High School**.** | **Insiza** | Matabeleland South | 6 | 4 | **2 — 23,400** |
| `86dc35f2` | Wanezi High School**.** | **Gwanda** | Matabeleland South | 4 | 1 | **1 — 15,600** |
| `c71c3d92` | Wanezi High Sc**oo**l | Unknown | **Harare** | 1 | 1 | 0 |

Two of them carry the **same name character for character** — including
the trailing full stop — and differ only by city. That is why the
duplicate check never caught them: it requires name **and city** to
match. The province is wrong on two records; Wanezi is in Insiza,
Matabeleland South.

**Njabulo Mathwasa is entered four times**, across three of those
records, with his phone stored four different ways:

| contact | phone as stored | sits under |
|---|---|---|
| `4a8d9f97` | `+263771777777` | Wanezi High Scool |
| `6f3939c1` | `263773456262` | Wanezi High School. |
| `9cd63ee8` | `0775169744` | Wanezi High School. |
| `f1dcf478` | `0775169744` | Wanezi High School. |

Two hold the identical number and still did not match — the duplicate
check compares the digits exactly as typed (see PH1).

## Why the payment looked wrong

The two invoices sit on **different Wanezi records**:

- **INV-2026-0062** — 7,800, marked **Paid**, amount_paid **0.00**, no
  payment attached.
- **INV-2026-0076** — 15,600, Partially-Paid, amount_paid 7,800, holding
  the only payment: **7,800 cash, 10 June 2026, ref PAY-2026-0035**.

Neither invoice has an instalment schedule. **Both states already existed
in the previous CRM** — nothing in the migration or the recent work
created them.

So this is not a payment recorded against the wrong invoice so much as
one school split in two, each half holding part of the story. Correcting
the payment before merging would simply move money between two records
that should not both exist.

## The plan

**Order matters.** Merge first, decide the money second.

1. **Agree the surviving record.** `5fa71762` is the natural parent: most
   contacts, most leads, both of one invoice pair. Its city (Insiza) and
   province (Matabeleland South) are correct. Confirm with Ms Mpofu — she
   owns merge decisions.
2. **Re-parent everything** from the other three: contacts, leads, deals,
   quotes, invoices. Five tables reference a school (leads, contacts,
   deals, quotes, invoices) and every one must move — see SCH1.
3. **Merge the four Njabulo contacts into one**, keeping `0775169744`
   normalised, and preserving the other numbers as alternatives rather
   than discarding them. Re-point every activity, lead and document.
4. **Correct the surviving record**: name without the trailing full stop,
   city Insiza, province Matabeleland South.
5. **Then, and only then, settle the money** with Kim: was 7,800 for
   0062, or for 0076 with 0062 settled another way? With one school and
   one contact, both invoices sit side by side and the answer should be
   visible.
6. **Write a manifest of every id moved**, so the whole thing reverses.

## Cautions

- **Do not use the "merged" button.** Marking a duplicate merged only
  writes a label and moves no data at all (DUP2). This has to be done
  deliberately.
- **Do not delete the losing records** until the re-parenting is verified.
  Soft-delete them afterwards so the trail survives.
- **Leave the invoices' totals and statuses alone** during the merge.
  Moving a document between schools must not touch what it says was owed
  or paid — that is a separate, human decision.
- **Expect more of these.** Wanezi is the case we happened to open. SCH1
  counted 13 duplicate school clusters, and the same name-plus-city
  matching rule that missed these will have missed others.
