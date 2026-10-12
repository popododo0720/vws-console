# Page brief

Measured from the 1024×594 reference screenshots.

## Tokens

- Header and footer background: `#161d26` (sampled rgb 22, 29, 38).
- Primary action: `#ff9900` (sampled rgb 255, 153, 0), dark label text.
- Links and the active nav item: `#006ce0` (sampled rgb 0, 108, 224).
- Page background: white. Buckets canvas: `#f3f3f5`.
- Available status: green `#037f0c` on `#e7f6e9`.
- Body font: Inter (installed locally). The reference face is a proprietary UI font and is not used.

## Layout

- Header is a single dark bar: mark, product name, search, icons, region, two-line account.
- Left nav is about 250px, white, with bold group labels and indented links. Groups collapse. A chevron on the nav edge hides it.
- List pages keep the title row fixed, scroll the table, and pin a resizable detail band to the bottom of the content column.
- The launch form is a stack of bordered rounded cards. The summary card stays in a right column on wide screens and stacks underneath on narrow screens.
- Buckets uses rounded white cards on the gray canvas, with a right-hand snapshot column.

## States

- Empty account matches the screenshots for instances, volumes, and buckets (no rows) and for VPCs and security groups (one default network and one default group).
- Sample data is a second dataset, selected from the account menu.
- A region other than Europe (North) shows an empty slice of the same data.

## Intentional differences

- The header name is VWS. Service menus use the reference labels EC2, EBS, S3, and VPC. The header mark is the VWS wordmark.
- Operating system tiles use original names and letter marks.
- Account id, resource ids, and region names are fictional.
- The reference instances panel was still loading alarms. This app shows the settled empty copy.
- Launch is the header services menu item and the Launch instances button. It is not a row in the Instances group.
