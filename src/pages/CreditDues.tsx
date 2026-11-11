import { useEffect, useMemo, useState, type FormEvent } from "react";
import { insertOwned, supabase, isMissingFunction } from "../supabase";
import { useToast } from "../components/Toast";
import {
  AlertIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
  WalletIcon,
  WhatsAppIcon,
} from "../components/Icon";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  PageStack,
  SearchInput,
  Select,
  SkeletonRows,
  StatCard,
  Textarea,
  type BadgeTone,
} from "../components/ui";
import { formatDate, formatMoney, formatMoneyRaw, formatNumber, toDateInputValue, todayISODate } from "../lib/format";
import { useCurrency } from "../components/CurrencyProvider";
import {
  computeDueStatus,
  resolveName,
  roundMoney,
  toNumber,
  validateDue,
} from "../lib/inventory";
import { allocatePayment, computePaymentStatus, type PaymentStatus } from "../lib/profit";
import {
  buildReminderMessage,
  buildWhatsAppUrl,
  getBusinessName,
  normalizePakistaniPhone,
  prettyPakistaniPhone,
} from "../lib/whatsapp";

type CustomerRef = {
  id: number;
  name: string;
  phone: string;
};

type CustomerDue = {
  id: number;
  name: string;
  phone: string;
  totalPurchases: number;
  totalPaid: number;
  outstandingDue: number;
  lastPurchase: string | null;
  status: PaymentStatus;
  salesCount: number;
};

type PaymentRecord = {
  id: number;
  customerId: number;
  amount: number;
  paidAt: string;
  note: string;
};

type Due = {
  id: number;
  customerId: number;
  customer: string;
  totalDue: number;
  paidAmount: number;
  remainingDue: number;
  dueDate: string;
  status: "Pending" | "Partial" | "Paid";
};

const STATUS_TONE: Record<PaymentStatus, BadgeTone> = {
  Paid: "mint",
  Partial: "yellow",
  Unpaid: "pink",
};

type DetailTarget = { customer: CustomerDue } | null;
type PayTarget = CustomerDue | null;

/**
 * One WhatsApp dues reminder while it is being prepared: the modal fetches
 * the customer's latest sales from Supabase before every send and rebuilds
 * the message from those figures.
 */
type ReminderTarget = {
  id: number;
  /** Row snapshot — shown until the fresh figures land. */
  name: string;
  loading: boolean;
  fetchError: string;
  totalPurchases: number;
  totalPaid: number;
  outstandingDue: number;
  /** Phone exactly as saved (may be malformed) — shown in validation message. */
  savedPhone: string;
  /** wa.me digits without the "+" (e.g. "923001234567"), or null. */
  waDigits: string | null;
  waNumber: string;
  message: string;
  messageDirty: boolean;
  phoneMissing: boolean;
};

type ReminderTotals = {
  totalPurchases: number;
  totalPaid: number;
  outstandingDue: number;
};

export default function CreditDues() {
  const toast = useToast();

  /**
   * Money inputs are typed in the SELECTED display currency and converted to
   * the base currency (PKR) exactly once when saving; edit forms are seeded
   * from the stored base amounts exactly once when opening.
   */
  const { currency, toPkr, toDisplay, pkrPerUnit, rateMissing } = useCurrency();

  const [customers, setCustomers] = useState<CustomerDue[]>([]);
  const [customerRefs, setCustomerRefs] = useState<CustomerRef[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [dues, setDues] = useState<Due[]>([]);
  const [legacyOpen, setLegacyOpen] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Due | null>(null);

  const [detailTarget, setDetailTarget] = useState<DetailTarget>(null);
  const [payTarget, setPayTarget] = useState<PayTarget>(null);
  const [reminder, setReminder] = useState<ReminderTarget | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // Manual (legacy) credit record form state.
  const [legacyCustomerId, setLegacyCustomerId] = useState("");
  const [totalDue, setTotalDue] = useState("");
  const [paidAmount, setLegacyPaidAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  // Record payment form state.
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const [paymentsBusy, setPaymentsBusy] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentsWarning, setPaymentsWarning] = useState("");

  /**
   * Customer balances are computed from actual sales records, never typed in.
   * Dues are therefore always the sum of each sale's remaining balance.
   */
  const loadAllData = async () => {
    setLoading(true);
    setError("");

    const [customersResult, salesResult, paymentsResult, duesResult] =
      await Promise.all([
        supabase.from("customers")
          .select("id, name, phone")
          .order("id", { ascending: true }),

        supabase.from("sales")
          .select(`
            id, customer_id, total_amount, paid_amount, due_amount, sale_date
          `)
          .order("id", { ascending: true }),

        supabase.from("payments")
          .select(`
            id, customer_id, amount, paid_at, note
          `)
          .order("paid_at", { ascending: false }),

        supabase.from("dues")
          .select(`
            id, customer_id, total_due, paid_amount, remaining_due, due_date, status
          `)
          .order("id", { ascending: true }),
      ]);

    if (customersResult.error) {
      console.error("Customers Error:", customersResult.error);
      setError(customersResult.error.message);
      setLoading(false);
      toast.error("Could not load customers", customersResult.error.message);
      return;
    }

    if (salesResult.error) {
      console.error("Sales Error:", salesResult.error);
      setError(salesResult.error.message);
      setLoading(false);
      toast.error("Could not load sales", salesResult.error.message);
      return;
    }

    // The payments ledger is supplementary: a missing table (not migrated yet)
    // degrades to an empty history instead of blanking the page.
    if (paymentsResult.error) {
      setPaymentsWarning(
        `Payment history could not be loaded (${paymentsResult.error.message}). ` +
          "Run the database migration to enable the payments ledger."
      );
      setPayments([]);
    } else {
      setPaymentsWarning("");
      setPayments(
        (paymentsResult.data ?? []).map((row) => ({
          id: toNumber(row.id),
          customerId: toNumber(row.customer_id),
          amount: toNumber(row.amount),
          paidAt: String(row.paid_at ?? ""),
          note: String(row.note ?? ""),
        }))
      );
    }

    const customerList = (customersResult.data ?? []).map((row) => ({
      id: toNumber(row.id),
      name: String(row.name ?? ""),
      phone: String(row.phone ?? ""),
    }));

    setCustomerRefs(customerList);

    if (duesResult.error) {
      // Legacy manual records stay optional — the page works without them.
      setDues([]);
    } else {
      const names = new Map(
        customerList.map((customer) => [customer.id, customer.name])
      );

      setDues((duesResult.data ?? []).map((item) => mapLegacyDue(item, names)));
    }

    const salesRows = salesResult.data ?? [];

    // Aggregate every sale into its customer's balance.
    const balances = new Map<
      number,
      { totalPurchases: number; totalPaid: number; lastPurchase: string | null; salesCount: number }
    >();

    salesRows.forEach((row) => {
      const id = toNumber(row.customer_id);
      const total = toNumber(row.total_amount);
      const paid = toNumber(row.paid_amount);
      const date = String(row.sale_date ?? "");

      const existing = balances.get(id) ?? {
        totalPurchases: 0,
        totalPaid: 0,
        lastPurchase: null,
        salesCount: 0,
      };

      balances.set(id, {
        totalPurchases: roundMoney(existing.totalPurchases + total),
        totalPaid: roundMoney(existing.totalPaid + paid),
        lastPurchase:
          existing.lastPurchase && existing.lastPurchase > date
            ? existing.lastPurchase
            : date || existing.lastPurchase,
        salesCount: existing.salesCount + 1,
      });
    });

    const mapped: CustomerDue[] = customerList.map((customer) => {
      const balance = balances.get(customer.id) ?? {
        totalPurchases: 0,
        totalPaid: 0,
        lastPurchase: null,
        salesCount: 0,
      };

      return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        totalPurchases: balance.totalPurchases,
        totalPaid: balance.totalPaid,
        outstandingDue: Math.max(
          0,
          roundMoney(balance.totalPurchases - balance.totalPaid)
        ),
        lastPurchase: balance.lastPurchase,
        status: computePaymentStatus(balance.totalPurchases, balance.totalPaid),
        salesCount: balance.salesCount,
      };
    });

    setCustomers(mapped);
    setLoading(false);
  };

  useEffect(() => {
    void loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  /* --------------------------- record payment --------------------------- */

  const paymentTargetOutstanding = payTarget
    ? Math.max(0, roundMoney(payTarget.totalPurchases - payTarget.totalPaid))
    : 0;

  const openPayForm = (customer: CustomerDue) => {
    setPayTarget(customer);
    setPaymentAmount("");
    setPaymentDate(todayISODate());
    setPaymentNote("");
  };

  const closePayForm = () => {
    setPayTarget(null);
    setPaymentsBusy(false);
  };

  /**
   * The outstanding balance in DISPLAY units: the stored base amount is
   * converted once, then the typed payment (already display units) is
   * subtracted directly.
   */
  const paymentRemainingPreview = Math.max(
    0,
    roundMoney(toDisplay(paymentTargetOutstanding) - (Number(paymentAmount) || 0))
  );

  const recordPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (paymentsBusy) return;

    const target = payTarget;

    if (!target) return;

    // The typed amount is in the selected display currency; the outstanding
    // balance is stored in base (PKR), so compare in display units.
    const amount = roundMoney(Number(paymentAmount) || 0);
    const outstandingDisplay = toDisplay(paymentTargetOutstanding);

    if (!paymentAmount.trim() || !Number.isFinite(Number(paymentAmount)) || amount <= 0) {
      toast.error("Check the payment", "Enter a payment amount greater than 0.");
      return;
    }

    if (amount > outstandingDisplay) {
      toast.error(
        "Payment too high",
        `Received ${formatMoneyRaw(amount)} exceeds the outstanding balance of ${formatMoneyRaw(outstandingDisplay)}.`
      );
      return;
    }

    // Convert to the stored base currency (PKR) exactly once, before any
    // database call sees the value.
    const amountBase = toPkr(amount);

    if (!paymentDate || !toDateInputValue(paymentDate)) {
      toast.error("Check the payment", "Select the payment date.");
      return;
    }

    setPaymentsBusy(true);

    try {
      /**
       * Preferred path: the database allocates the payment FIFO across the
       * customer's open sales, updates paid/due and writes the payments
       * ledger — all in one transaction.
       */
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "record_customer_payment",
        {
          p_customer_id: target.id,
          p_amount: amountBase,
          p_paid_at: toDateInputValue(paymentDate),
          p_note: paymentNote.trim() ? paymentNote.trim() : null,
        }
      );

      if (rpcError && !isMissingFunction(rpcError)) {
        console.error("Record Payment RPC Error:", rpcError);
        toast.error("Could not record payment", rpcError.message);
        setPaymentsBusy(false);
        return;
      }

      if (rpcError) {
        console.warn(
          "record_customer_payment unavailable — falling back to client-side allocation."
        );
        await recordPaymentFallback(
          target,
          amountBase,
          amount,
          paymentDate,
          paymentNote
        );
      } else {
        const applied = rpcData as { unallocated?: number } | null;

        if (applied && Number(applied.unallocated ?? 0) > 0.009) {
          toast.error(
            "Payment partly unused",
            "Some of the payment could not be matched to an open sale. Balances were checked — refresh to confirm."
          );
        } else {
          toast.success(
            "Payment recorded",
            `${target.name} paid ${formatMoneyRaw(amount)}`
          );
        }
      }

      await loadAllData();
      closePayForm();
    } catch (caught) {
      console.error("Unexpected Payment Error:", caught);
      toast.error(
        "Something went wrong while recording the payment",
        caught instanceof Error ? caught.message : undefined
      );
      setPaymentsBusy(false);
    }
  };

  /**
   * Client-side FIFO fallback used only when the database function has not
   * been migrated yet. Each sale update is verified so partial progress is
   * always reported rather than silently claimed. `amountBase` is in the
   * stored base currency; `displayAmount` is what the user typed, kept only
   * for the confirmation toast.
   */
  const recordPaymentFallback = async (
    target: CustomerDue,
    amountBase: number,
    displayAmount: number,
    paymentDate: string,
    note: string
  ) => {
    const { data: openSales, error: openError } = await supabase
      .from("sales")
      .select("id, total_amount, paid_amount")
      .eq("customer_id", target.id)
      .gt("due_amount", 0.009)
      .order("sale_date", { ascending: true })
      .order("id", { ascending: true });

    if (openError) {
      console.error("Open Sales Error:", openError);
      toast.error("Could not allocate payment", openError.message);
      setPaymentsBusy(false);
      return;
    }

    const allocation = allocatePayment(
      (openSales ?? []).map((row) => ({
        id: toNumber(row.id),
        dueAmount: roundMoney(
          toNumber(row.total_amount) - toNumber(row.paid_amount)
        ),
      })),
      amountBase
    );

    if (allocation.applications.length === 0 || allocation.unallocated > 0.009) {
      toast.error(
        "Payment too high",
        "The payment exceeds this customer's open balances. Refresh and try again."
      );
      setPaymentsBusy(false);
      return;
    }

    let firstError: { message: string } | null = null;
    let ledgerWarning = "";

    for (const application of allocation.applications) {
      const saleRow = (openSales ?? []).find((row) => toNumber(row.id) === application.saleId);

      if (!saleRow) continue;

      const nextPaid = roundMoney(toNumber(saleRow.paid_amount) + application.amount);
      const nextDue = roundMoney(toNumber(saleRow.total_amount) - nextPaid);

      // eslint-disable-next-line no-await-in-loop -- allocations apply in order
      const { data: updatedRows, error: updateError } = await supabase
        .from("sales")
        .update({ paid_amount: nextPaid, due_amount: nextDue })
        .eq("id", application.saleId)
        .select("id");

      if (updateError && !firstError) firstError = updateError;

      if (!updateError && (!updatedRows || updatedRows.length === 0) && !firstError) {
        firstError = { message: `Sale #${application.saleId} could not be updated.` };
      }

      if (updateError || (!updatedRows || updatedRows.length === 0)) continue;

      // eslint-disable-next-line no-await-in-loop -- payments write in order
      const { error: paymentInsertError } = await insertOwned("payments", [
        {
          customer_id: target.id,
          sale_id: application.saleId,
          amount: application.amount,
          paid_at: paymentDate,
          note: note.trim() ? note.trim() : null,
        },
      ]);

      if (paymentInsertError) {
        // Balances are already correct; only the history ledger may be missing.
        if (paymentInsertError.message.toLowerCase().includes("could not find the table")) {
          ledgerWarning =
            "The payments ledger table does not exist yet — run the database migration to keep payment history.";
        } else if (!firstError) {
          firstError = paymentInsertError;
        }
      }
    }

    if (ledgerWarning) setPaymentsWarning(ledgerWarning);

    if (firstError) {
      console.error("Payment fallback error:", firstError);
      toast.error("Could not record payment", firstError.message);
      setPaymentsBusy(false);
      return;
    }

    toast.success(
      "Payment recorded",
      `${target.name} paid ${formatMoneyRaw(displayAmount)}`
    );
    setPaymentsBusy(false);
  };

  /* --------------------------- legacy manual dues --------------------------- */

  const openLegacyAddForm = () => {
    setEditingId(null);
    setLegacyCustomerId("");
    setTotalDue("");
    setLegacyPaidAmount("");
    setDueDate(todayISODate());
    setShowForm(true);
  };

  const openLegacyEditForm = (due: Due) => {
    setEditingId(due.id);
    setLegacyCustomerId(due.customerId.toString());
    // Stored base amounts are shown in the selected display currency, with
    // enough precision to round-trip without corrupting the record.
    setTotalDue(String(toDisplay(due.totalDue)));
    setLegacyPaidAmount(String(toDisplay(due.paidAmount)));
    // Normalised so a stored timestamp cannot render as an empty date field.
    setDueDate(toDateInputValue(due.dueDate));
    setShowForm(true);
  };

  const closeLegacyForm = () => {
    setShowForm(false);
    setEditingId(null);
    setSaving(false);
  };

  const saveLegacyDue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (saving) return;

    // Validate in display units (what the user sees), then convert to the
    // stored base currency (PKR) exactly once before touching the database.
    const issues = validateDue({
      customerId: legacyCustomerId,
      totalDue,
      paidAmount,
      dueDate,
    });

    if (issues.length > 0) {
      toast.error(issues[0].message);
      return;
    }

    const total = toPkr(toNumber(totalDue));
    // The paid amount can never exceed the total; clamping also guards the
    // theoretical corner where currency rounding moves it by a fraction.
    const paid = Math.min(
      toPkr(toNumber(paidAmount)),
      toPkr(toNumber(totalDue))
    );
    const remaining = roundMoney(Math.max(0, total - paid));
    const status = computeDueStatus(total, paid);

    const dueData = {
      customer_id: Number(legacyCustomerId),
      total_due: total,
      paid_amount: paid,
      remaining_due: remaining,
      due_date: dueDate,
      status,
    };

    setSaving(true);

    if (editingId !== null) {
      const { data: updatedRows, error: updateError } = await supabase
        .from("dues")
        .update(dueData)
        .eq("id", editingId)
        .select("id");

      if (updateError) {
        console.error("Update Due Error:", updateError);
        toast.error("Could not update due", updateError.message);
        setSaving(false);
        return;
      }

      if (!updatedRows || updatedRows.length === 0) {
        toast.error(
          "Credit record was not saved",
          "No matching row was updated. It may have been deleted, or your account may not have permission to edit it."
        );
        setSaving(false);
        return;
      }

      toast.success("Due updated successfully");
    } else {
      const { error: insertError } = await insertOwned("dues", [dueData]);

      if (insertError) {
        console.error("Add Due Error:", insertError);
        toast.error("Could not add due", insertError.message);
        setSaving(false);
        return;
      }

      toast.success("Due added successfully");
    }

    await loadAllData();
    closeLegacyForm();
  };

  const deleteLegacyDue = async (due: Due) => {
    setSaving(true);

    const { data: deletedRows, error: deleteError } = await supabase
      .from("dues")
      .delete()
      .eq("id", due.id)
      .select("id");

    setSaving(false);
    setPendingDelete(null);

    if (deleteError) {
      console.error("Delete Due Error:", deleteError);
      toast.error("Could not delete due", deleteError.message);
      return;
    }

    if (!deletedRows || deletedRows.length === 0) {
      toast.error("Record was not deleted", "It may already have been removed.");
      return;
    }

    await loadAllData();
    toast.success("Due deleted successfully");
  };

  /* ------------------------- whatsapp dues reminder ------------------------- */

  const closeReminder = () => {
    setReminder(null);
  };

  /** Balance aggregation identical to `loadAllData` — same trusted math. */
  const aggregateSales = (rows: { total_amount: unknown; paid_amount: unknown }[]): ReminderTotals => {
    let totalPurchases = 0;
    let totalPaid = 0;

    rows.forEach((row) => {
      totalPurchases = roundMoney(totalPurchases + toNumber(row.total_amount));
      totalPaid = roundMoney(totalPaid + toNumber(row.paid_amount));
    });

    return {
      totalPurchases,
      totalPaid,
      outstandingDue: Math.max(0, roundMoney(totalPurchases - totalPaid)),
    };
  };

  /**
   * Open the reminder modal. The latest customer row and the customer's open
   * sales are re-read from Supabase at that moment so every figure in the
   * message is current — read-only, no dues or payments are modified and RLS
   * scopes every query to the signed-in shop.
   */
  const openReminder = async (customer: CustomerDue) => {
    const businessName = getBusinessName();

    const seedMessage = buildReminderMessage(
      {
        customerName: customer.name,
        businessName,
        totalPurchases: customer.totalPurchases,
        totalPaid: customer.totalPaid,
        outstandingDue: customer.outstandingDue,
      },
      { code: currency, pkrPerUnit: rateMissing ? null : pkrPerUnit }
    );

    const digits = normalizePakistaniPhone(customer.phone);

    setReminder({
      id: customer.id,
      name: customer.name,
      loading: true,
      fetchError: "",
      totalPurchases: customer.totalPurchases,
      totalPaid: customer.totalPaid,
      outstandingDue: customer.outstandingDue,
      savedPhone: customer.phone,
      waDigits: digits,
      waNumber: digits ? prettyPakistaniPhone(digits) : "",
      message: seedMessage,
      messageDirty: false,
      phoneMissing: customer.phone.trim().length === 0,
    });

    const [customerResult, salesResult] = await Promise.all([
      supabase
        .from("customers")
        .select("id, name, phone")
        .eq("id", customer.id)
        .limit(1)
        .maybeSingle(),

      supabase
        .from("sales")
        .select("total_amount, paid_amount")
        .eq("customer_id", customer.id),
    ]);

    if (customerResult.error) {
      console.error("Reminder Customer Error:", customerResult.error);
      toast.error(
        "Could not load customer details",
        customerResult.error.message
      );
      setReminder(null);
      return;
    }

    if (salesResult.error) {
      console.error("Reminder Sales Error:", salesResult.error);
      toast.error("Could not load payment details", salesResult.error.message);
      setReminder(null);
      return;
    }

    const latestName = String(customerResult.data?.name ?? customer.name);
    const latestPhone = String(customerResult.data?.phone ?? customer.phone);
    const latestDigits = normalizePakistaniPhone(latestPhone);
    const latestTotals = aggregateSales(salesResult.data ?? []);
    const latestMessage = buildReminderMessage(
      {
        customerName: latestName,
        businessName,
        ...latestTotals,
      },
      { code: currency, pkrPerUnit: rateMissing ? null : pkrPerUnit }
    );

    setReminder((current) => {
      if (!current || current.id !== customer.id) return current;

      return {
        ...current,
        name: latestName,
        loading: false,
        totalPurchases: latestTotals.totalPurchases,
        totalPaid: latestTotals.totalPaid,
        outstandingDue: latestTotals.outstandingDue,
        savedPhone: latestPhone,
        waDigits: latestDigits,
        waNumber: latestDigits ? prettyPakistaniPhone(latestDigits) : "",
        // The default message refreshes with the fresh figures unless the
        // user has already started editing — an edit is always preserved.
        message:
          current.messageDirty || latestDigits !== digits
            ? current.message
            : latestMessage,
        phoneMissing: latestPhone.trim().length === 0,
      };
    });
  };

  const editReminderMessage = (next: string) => {
    setReminder((current) =>
      current ? { ...current, message: next, messageDirty: true } : current
    );
  };

  const restoreReminderMessage = () => {
    setReminder((current) =>
      current
        ? {
            ...current,
            messageDirty: false,
            message: buildReminderMessage(
              {
                customerName: current.name,
                businessName: getBusinessName(),
                totalPurchases: current.totalPurchases,
                totalPaid: current.totalPaid,
                outstandingDue: current.outstandingDue,
              },
              { code: currency, pkrPerUnit: rateMissing ? null : pkrPerUnit }
            ),
          }
        : current
    );
  };

  const openWhatsAppChat = () => {
    const target = reminder;

    if (!target || !target.waDigits || target.loading) return;

    const url = buildWhatsAppUrl(target.waDigits, target.message);

    // User-initiated action only: the message is NEVER sent here. The
    // shopkeeper presses Send inside WhatsApp.
    const opened = window.open(url, "_blank", "noopener,noreferrer");

    if (!opened) {
      window.location.href = url;
    }

    toast.info(
      "WhatsApp opened",
      "The chat is pre-filled with your reminder — review and press Send there."
    );

    closeReminder();
  };

  /* ------------------------------- derived ------------------------------- */

  const filteredCustomers = useMemo(() => {
    const term = search.toLowerCase().trim();

    return customers.filter((customer) => {
      const matchesTerm =
        term.length === 0 ||
        `${customer.name} ${customer.phone}`.toLowerCase().includes(term);

      const matchesStatus =
        statusFilter === "All" ||
        (statusFilter === "Open" && customer.outstandingDue > 0) ||
        (statusFilter === "Settled" && customer.outstandingDue <= 0);

      return matchesTerm && matchesStatus;
    });
  }, [customers, search, statusFilter]);

  const summary = useMemo(() => {
    let outstanding = 0;
    let collected = 0;
    let open = 0;
    let settled = 0;

    customers.forEach((customer) => {
      outstanding += customer.outstandingDue;
      collected += customer.totalPaid;

      if (customer.outstandingDue > 0) open += 1;
      else settled += 1;
    });

    return { outstanding, collected, open, settled };
  }, [customers]);

  const detailPayments = useMemo(() => {
    if (!detailTarget) return [];

    return payments
      .filter((payment) => payment.customerId === detailTarget.customer.id)
      .sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
  }, [payments, detailTarget]);

  const previewRemaining = Math.max(
    (Number(totalDue) || 0) - (Number(paidAmount) || 0),
    0
  );

  return (
    <main className="page-content">
      <PageStack>
        <PageHeader
          title="Credit & Dues"
          description="Customer balances built automatically from real sales and payments."
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => void loadAllData()}
                disabled={loading}
              >
                <RefreshIcon size={15} />
                Refresh
              </Button>

              <Button variant="primary" onClick={openLegacyAddForm}>
                <PlusIcon size={15} />
                Manual entry
              </Button>
            </>
          }
        />

        {error ? (
          <div className="alert alert-error" role="alert">
            <AlertIcon size={16} />
            <div className="alert-content">
              <strong>Could not load credit records</strong>
              {error}
            </div>
          </div>
        ) : null}

        {paymentsWarning ? (
          <div className="alert alert-warning" role="status">
            <AlertIcon size={16} />
            <div className="alert-content">
              <strong>Payments ledger unavailable</strong>
              {paymentsWarning} Recording payments still works and sales
              balances stay accurate.
            </div>
          </div>
        ) : null}

        <div className="stat-grid">
          <StatCard
            label="Outstanding dues"
            value={formatMoney(summary.outstanding, 0)}
            tone="pink"
            icon={<AlertIcon size={16} />}
            loading={loading}
            meta="From unpaid sale balances"
          />

          <StatCard
            label="Total collected"
            value={formatMoney(summary.collected, 0)}
            tone="mint"
            icon={<CheckCircleIcon size={16} />}
            loading={loading}
            meta="Across completed sales"
          />

          <StatCard
            label="Customers owing"
            value={formatNumber(summary.open)}
            tone="yellow"
            icon={<ClockIcon size={16} />}
            loading={loading}
            meta="With open balances"
          />

          <StatCard
            label="Fully paid"
            value={formatNumber(summary.settled)}
            tone="sky"
            icon={<WalletIcon size={16} />}
            loading={loading}
            meta={`${customers.length} customers total`}
          />
        </div>

        <Card>
          <CardHeader
            title="Customer balances"
            description={`${filteredCustomers.length} of ${customers.length} customers shown`
            }
            actions={
              <div className="filter-row">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search customer or phone..."
                  label="Search customer balances"
                />

                <Select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  aria-label="Filter by balance status"
                  style={{ width: "auto", minWidth: 140 }}
                >
                  <option value="All">All customers</option>
                  <option value="Open">Outstanding due</option>
                  <option value="Settled">Fully paid</option>
                </Select>
              </div>
            }
          />

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th className="num">Total purchases</th>
                  <th className="num">Total paid</th>
                  <th className="num">Outstanding due</th>
                  <th>Last purchase</th>
                  <th>Status</th>
                  <th className="actions-cell">Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <SkeletonRows rows={6} />
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="table-empty-cell">
                      <EmptyState
                        icon={<SearchIcon size={20} />}
                        title={
                          customers.length === 0
                            ? "No customers yet"
                            : "No customers found"
                        }
                        description={
                          customers.length === 0
                            ? "Balance figures appear automatically as soon as sales are recorded."
                            : "Try a different search or status filter."
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((customer) => (
                    <tr key={customer.id}>
                      <td className="cell-primary">
                        <span className="cell-stack">
                          <strong>{customer.name}</strong>
                          <small className="cell-muted">
                            {customer.phone || "No phone on file"}
                          </small>
                        </span>
                      </td>

                      <td className="num">
                        {formatMoney(customer.totalPurchases, 0)}
                      </td>

                      <td className="num money-pos">
                        {formatMoney(customer.totalPaid, 0)}
                      </td>

                      <td className="num">
                        {customer.outstandingDue > 0 ? (
                          <span className="money-neg">
                            {formatMoney(customer.outstandingDue, 0)}
                          </span>
                        ) : (
                          <span className="money-pos">Settled</span>
                        )}
                      </td>

                      <td className="cell-muted">
                        {customer.lastPurchase
                          ? formatDate(customer.lastPurchase)
                          : "No sales yet"}
                      </td>

                      <td>
                        <Badge tone={STATUS_TONE[customer.status]}>
                          {customer.status === "Unpaid"
                            ? "Unpaid"
                            : customer.status}
                        </Badge>
                      </td>

                      <td className="actions-cell">
                        <span className="row-actions">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => openPayForm(customer)}
                            disabled={customer.outstandingDue <= 0}
                          >
                            <WalletIcon size={14} />
                            Pay
                          </Button>

                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setDetailTarget({ customer })}
                          >
                            <EyeIcon size={14} />
                            Details
                          </Button>

                          {customer.outstandingDue > 0 ? (
                            <Button
                              size="sm"
                              variant="whatsapp"
                              onClick={() => void openReminder(customer)}
                            >
                              <WhatsAppIcon size={14} />
                              Remind via WhatsApp
                            </Button>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {dues.length > 0 || legacyOpen ? (
          <Card>
            <CardHeader
              title="Manual credit records"
              description="Legacy records kept for reference — they are separate from sale balances."
              plain
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setLegacyOpen((value) => !value)}
                >
                  {legacyOpen ? "Hide" : "Show"}
                </Button>
              }
            />

            {legacyOpen ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th className="num">Total due</th>
                      <th className="num">Paid</th>
                      <th className="num">Remaining</th>
                      <th>Due date</th>
                      <th>Status</th>
                      <th className="actions-cell">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {dues.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="table-empty-cell">
                          <EmptyState
                            icon={<WalletIcon size={20} />}
                            title="No manual credit records"
                            description="Old credit entries remain editable and deletable here."
                          />
                        </td>
                      </tr>
                    ) : (
                      dues.map((due) => (
                        <tr key={due.id}>
                          <td className="cell-primary">{due.customer}</td>

                          <td className="num">{formatMoney(due.totalDue)}</td>

                          <td className="num money-pos">
                            {formatMoney(due.paidAmount)}
                          </td>

                          <td className="num">
                            {due.remainingDue > 0 ? (
                              <span className="money-neg">
                                {formatMoney(due.remainingDue)}
                              </span>
                            ) : (
                              <span className="money-pos">Settled</span>
                            )}
                          </td>

                          <td className="cell-muted">{formatDate(due.dueDate)}</td>

                          <td>
                            <Badge
                              tone={
                                due.status === "Paid"
                                  ? "mint"
                                  : due.status === "Partial"
                                    ? "yellow"
                                    : "pink"
                              }
                            >
                              {due.status}
                            </Badge>
                          </td>

                          <td className="actions-cell">
                            <span className="row-actions">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => openLegacyEditForm(due)}
                              >
                                <PencilIcon size={14} />
                                Edit
                              </Button>

                              <Button
                                size="sm"
                                variant="soft-danger"
                                onClick={() => setPendingDelete(due)}
                              >
                                <TrashIcon size={14} />
                              </Button>
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Card>
        ) : null}
      </PageStack>

      {/* ------------------------- record payment ------------------------- */}

      <Modal
        open={payTarget !== null}
        title="Record customer payment"
        description="Collect money against this customer's outstanding sales balance."
        onClose={closePayForm}
        footer={
          <>
            <Button variant="ghost" onClick={closePayForm} disabled={paymentsBusy}>
              Cancel
            </Button>

            <Button
              variant="primary"
              type="submit"
              form="payment-form"
              disabled={paymentsBusy}
            >
              {paymentsBusy ? "Saving..." : "Record payment"}
            </Button>
          </>
        }
      >
        {payTarget ? (
          <form id="payment-form" className="modal-form" onSubmit={recordPayment}>
            <div className="modal-body">
              <div className="calc-panel">
                <div className="calc-row">
                  <span>{payTarget.name} — outstanding balance</span>
                  <strong>{formatMoney(paymentTargetOutstanding)}</strong>
                </div>

                <div className="calc-row">
                  <span>Remaining after this payment</span>
                  <strong
                    className={paymentRemainingPreview > 0 ? "money-neg" : "money-pos"}
                  >
                    {formatMoneyRaw(paymentRemainingPreview)}
                  </strong>
                </div>
              </div>

              <div className="form-grid">
                <Field label={`Payment amount (${currency})`} required>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    required
                  />
                </Field>

                <Field label="Payment date" required>
                  <span style={{ position: "relative", display: "block" }}>
                    <span
                      style={{
                        position: "absolute",
                        left: 11,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "var(--text-muted)",
                        pointerEvents: "none",
                      }}
                    >
                      <CalendarIcon size={15} />
                    </span>

                    <Input
                      type="date"
                      value={paymentDate}
                      onChange={(event) => setPaymentDate(event.target.value)}
                      style={{ paddingLeft: 34 }}
                      required
                    />
                  </span>
                </Field>

                <Field label="Reference / note" className="span-2">
                  <Input
                    type="text"
                    placeholder="Optional note for this payment"
                    value={paymentNote}
                    onChange={(event) => setPaymentNote(event.target.value)}
                  />
                </Field>
              </div>

              <p className="calc-note">
                The payment is applied to the oldest unpaid sales first and the
                customer's status updates automatically. It is never counted as
                a new sale or as profit.
              </p>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* ------------------------- customer details ------------------------- */}

      <Modal
        open={detailTarget !== null}
        size="md"
        title={detailTarget?.customer.name ?? "Customer details"}
        description="Purchases, payments and current balance for this customer."
        onClose={() => setDetailTarget(null)}
      >
        {detailTarget ? (
          <div className="modal-body">
            <div className="calc-panel">
              <div className="calc-row">
                <span>Total purchases</span>
                <strong>{formatMoney(detailTarget.customer.totalPurchases)}</strong>
              </div>

              <div className="calc-row">
                <span>Total payments received</span>
                <strong>
                  {formatMoney(detailTarget.customer.totalPaid)}
                </strong>
              </div>

              <div className="calc-row">
                <span>Outstanding due</span>
                <strong
                  className={detailTarget.customer.outstandingDue > 0 ? "money-neg" : "money-pos"}
                >
                  {formatMoney(detailTarget.customer.outstandingDue)}
                </strong>
              </div>

              <div className="calc-row">
                <span>Payment status</span>
                <Badge tone={STATUS_TONE[detailTarget.customer.status]}>
                  {detailTarget.customer.status === "Unpaid"
                    ? "Unpaid"
                    : detailTarget.customer.status}
                </Badge>
              </div>
            </div>

            <h4 className="detail-subheading">Purchases</h4>

            <DetailPurchases customerId={detailTarget.customer.id} />

            <h4 className="detail-subheading">Payment history</h4>

            {detailPayments.length === 0 ? (
              <p className="detail-empty">No separate payments recorded yet.</p>
            ) : (
              <ul className="payment-history">
                {detailPayments.map((payment) => (
                  <li key={payment.id} className="payment-history-row">
                    <span className="payment-date">
                      {formatDate(payment.paidAt)}
                    </span>
                    <span className="payment-amount money-pos">
                      {formatMoney(payment.amount)}
                    </span>
                    {payment.note ? (
                      <span className="payment-note">{payment.note}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {detailPayments.length > 0 ? (
              <p className="payment-history-total">
                {formatNumber(detailPayments.length)} payment
                {detailPayments.length === 1 ? "" : "s"} recorded
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* ------------------------ whatsapp reminder ------------------------ */}

      <Modal
        open={reminder !== null}
        size="md"
        title="WhatsApp dues reminder"
        description="Nothing is sent automatically — you review the message and press Send in WhatsApp."
        onClose={closeReminder}
        footer={
          <>
            <Button variant="ghost" onClick={closeReminder}>
              Cancel
            </Button>

            <Button
              variant="whatsapp"
              onClick={openWhatsAppChat}
              disabled={
                reminder?.loading ||
                Boolean(reminder?.fetchError) ||
                !reminder?.waDigits ||
                reminder?.outstandingDue <= 0
              }
            >
              <WhatsAppIcon size={15} />
              Open WhatsApp
            </Button>
          </>
        }
      >
        {reminder ? (
          <div className="modal-body">
            {reminder.loading ? (
              <LoadingBlock label="Fetching the latest payment details..." />
            ) : reminder.fetchError ? (
              <div className="alert alert-error" role="alert">
                <AlertIcon size={16} />
                <div className="alert-content">
                  <strong>Could not load payment details</strong>
                  {reminder.fetchError}
                </div>
              </div>
            ) : (
              <>
                <div className="calc-panel">
                  <div className="calc-row">
                    <span>Customer</span>
                    <strong>{reminder.name}</strong>
                  </div>

                  <div className="calc-row">
                    <span>WhatsApp number</span>
                    <strong>
                      {reminder.waDigits ? reminder.waNumber : "Not available"}
                    </strong>
                  </div>

                  <div className="calc-row">
                    <span>Total amount</span>
                    <strong>{formatMoney(reminder.totalPurchases)}</strong>
                  </div>

                  <div className="calc-row">
                    <span>Paid amount</span>
                    <strong className="money-pos">
                      {formatMoney(reminder.totalPaid)}
                    </strong>
                  </div>

                  <div className="calc-row">
                    <span>Remaining dues</span>
                    <strong
                      className={
                        reminder.outstandingDue > 0 ? "money-neg" : "money-pos"
                      }
                    >
                      {formatMoney(reminder.outstandingDue)}
                    </strong>
                  </div>
                </div>

                {reminder.outstandingDue <= 0 ? (
                  <div className="alert alert-warning" role="status">
                    <AlertIcon size={16} />
                    <div className="alert-content">
                      <strong>Balance fully settled</strong>
                      {reminder.name} has paid everything — no reminder is
                      needed. Refresh the page to see the updated balance.
                    </div>
                  </div>
                ) : null}

                {!reminder.waDigits ? (
                  <div className="alert alert-error" role="alert">
                    <AlertIcon size={16} />
                    <div className="alert-content">
                      <strong>A valid WhatsApp number is required</strong>
                      {reminder.phoneMissing
                        ? `${reminder.name} has no phone number saved. Add a phone number on the Customers page first.`
                        : `The saved number "${reminder.savedPhone}" is not a valid Pakistani mobile number. Correct it on the Customers page to enable WhatsApp reminders.`}
                    </div>
                  </div>
                ) : null}

                <Field
                  label="Message preview"
                  hint="Edit the text below — your changes are kept when WhatsApp opens."
                >
                  <Textarea
                    rows={13}
                    value={reminder.message}
                    onChange={(event) => editReminderMessage(event.target.value)}
                    spellCheck={false}
                  />
                </Field>

                <div className="reminder-actions">
                  <Button size="sm" variant="ghost" onClick={restoreReminderMessage}>
                    <RefreshIcon size={13} />
                    Restore default message
                  </Button>

                  <span className="reminder-note">
                    Uses official WhatsApp Click-to-Chat — WhatsApp itself sends
                    nothing until you press Send.
                  </span>
                </div>
              </>
            )}
          </div>
        ) : null}
      </Modal>

      {/* ------------------------ legacy manual form ------------------------ */}

      <Modal
        open={showForm}
        title={editingId === null ? "Add manual credit record" : "Edit manual credit record"}
        description="For credit given outside normal sales. Sales-based dues are tracked automatically."
        onClose={closeLegacyForm}
        footer={
          <>
            <Button variant="ghost" onClick={closeLegacyForm} disabled={saving}>
              Cancel
            </Button>

            <Button
              variant="primary"
              type="submit"
              form="due-form"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : editingId === null
                  ? "Save due"
                  : "Update due"}
            </Button>
          </>
        }
      >
        <form id="due-form" className="modal-form" onSubmit={saveLegacyDue}>
          <div className="modal-body">
            <div className="form-grid">
              <Field label="Customer" required className="span-2">
                <Select
                  value={legacyCustomerId}
                  onChange={(event) => setLegacyCustomerId(event.target.value)}
                >
                  <option value="">Select customer</option>

                  {customerRefs.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </Select>
              </Field>

                <Field label={`Total due (${currency})`} required>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0.00"
                    value={totalDue}
                    onChange={(event) => setTotalDue(event.target.value)}
                  />
                </Field>

                <Field
                  label={`Paid amount (${currency})`}
                  hint={`Remaining: ${formatMoneyRaw(previewRemaining)}`}
                >
                  <Input
                    type="number"
                    min="0"
                    placeholder="0.00"
                    value={paidAmount}
                    onChange={(event) => setLegacyPaidAmount(event.target.value)}
                  />
                </Field>

              <Field label="Due date" required>
                <span style={{ position: "relative", display: "block" }}>
                  <span
                    style={{
                      position: "absolute",
                      left: 11,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--text-muted)",
                      pointerEvents: "none",
                    }}
                  >
                    <CalendarIcon size={15} />
                  </span>

                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    style={{ paddingLeft: 34 }}
                  />
                </span>
              </Field>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        busy={saving}
        title="Delete credit record"
        description={`The record for "${pendingDelete?.customer ?? ""}" will be permanently removed.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void deleteLegacyDue(pendingDelete);
        }}
      />
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Detail modal internals                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The customer's related sales, loaded when the detail modal opens. Kept as a
 * separate component so the modal stays simple and the fetch fails loudly.
 */
function DetailPurchases({ customerId }: { customerId: number }) {
  const [rows, setRows] = useState<{
    id: number;
    quantity: number;
    totalAmount: number;
    paidAmount: number;
    dueAmount: number;
    productName: string;
    date: string;
    status: PaymentStatus;
  }[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    setRows(null);
    setError("");

    void supabase
      .from("sales")
      .select(`
        id, quantity, total_amount, paid_amount, due_amount,
        sale_date, product_name, products(name)
      `)
      .eq("customer_id", customerId)
      .order("sale_date", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (!active) return;

        if (loadError) {
          console.error("Detail Purchases Error:", loadError);
          setError(loadError.message);
          return;
        }

        setRows(
          (data ?? []).map((row) => {
            const joinedNames = (row as { products?: { name: unknown }[] }).products;
            const linkedName = joinedNames?.[0]?.name;

            return {
              id: toNumber(row.id),
              quantity: toNumber(row.quantity),
              totalAmount: toNumber(row.total_amount),
              paidAmount: toNumber(row.paid_amount),
              dueAmount: toNumber(row.due_amount),
              productName:
                row.product_name ??
                (linkedName
                  ? String(linkedName)
                  : "Product"),
              date: String(row.sale_date ?? ""),
              status: computePaymentStatus(
                toNumber(row.total_amount),
                toNumber(row.paid_amount)
              ),
            };
          })
        );
      });

    return () => {
      active = false;
    };
  }, [customerId]);

  if (error) {
    return <p className="detail-empty detail-error">Could not load purchases: {error}</p>;
  }

  if (rows === null) {
    return <p className="detail-empty">Loading purchases...</p>;
  }

  if (rows.length === 0) {
    return <p className="detail-empty">No purchases recorded for this customer yet.</p>;
  }

  return (
    <ul className="purchase-history">
      {rows.map((row) => (
        <li key={row.id} className="purchase-history-row">
          <span className="purchase-main">
            <strong>{row.productName}</strong>
            <small>
              #{row.id} · {row.quantity} unit{row.quantity === 1 ? "" : "s"} · {formatDate(row.date)}
            </small>
          </span>

          <span className="purchase-financials num">
            <span>{formatMoney(row.totalAmount, 0)}</span>
            <span className="money-pos">{formatMoney(row.paidAmount, 0)}</span>
            <span className={row.dueAmount > 0 ? "money-neg" : "money-pos"}>
              {row.dueAmount > 0 ? `${formatMoney(row.dueAmount, 0)} due` : "Settled"}
            </span>
            <Badge
              tone={
                row.status === "Paid" ? "mint" : row.status === "Partial" ? "yellow" : "pink"
              }
            >
              {row.status}
            </Badge>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Map a raw `dues` row, deriving its status from the amounts. */
function mapLegacyDue(
  item: {
    id: unknown;
    customer_id: unknown;
    total_due: unknown;
    paid_amount: unknown;
    due_date: unknown;
  },
  names: Map<number, string>
): Due {
  const totalDue = toNumber(item.total_due);
  const paidAmount = toNumber(item.paid_amount);

  return {
    id: toNumber(item.id),
    customerId: toNumber(item.customer_id),
    customer: resolveName(names, item.customer_id, "Customer"),
    totalDue,
    paidAmount,
    remainingDue: roundMoney(Math.max(0, totalDue - paidAmount)),
    dueDate: String(item.due_date ?? ""),
    status: computeDueStatus(totalDue, paidAmount),
  };
}
