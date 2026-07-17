"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useCart } from "@/components/providers/CartProvider";
import { DEPARTMENTS, DELIVERY_FEE_PER_CANTEEN } from "@/lib/constants";
import { formatPrice } from "@/lib/format";
import {
  buildOrder,
  calculateDeliveryFee,
  generateOrderNumber,
  groupItemsByCanteen,
} from "@/lib/cart-utils";
import {
  buildWhatsAppUrl,
  formatWhatsAppOrderMessage,
} from "@/lib/whatsapp";
import type { CheckoutFormData, OrderType } from "@/lib/types";

const initialForm: CheckoutFormData = {
  registrationNumber: "",
  studentName: "",
  phone: "",
  department: DEPARTMENTS[0],
  orderType: "pickup",
  deliveryLocation: "",
  specialInstructions: "",
  paymentMethod: "cash-pickup",
};

type FormErrors = Partial<Record<keyof CheckoutFormData, string>>;

export default function CheckoutPageContent() {
  const router = useRouter();
  const { items, subtotal, clearCart, isHydrated } = useCart();
  const [form, setForm] = useState<CheckoutFormData>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canteenGroups = useMemo(() => groupItemsByCanteen(items), [items]);
  const deliveryFee = calculateDeliveryFee(items, form.orderType);
  const grandTotal = subtotal + deliveryFee;
  const prepTime = "15–20 min";

  const isFormValid = useMemo(() => {
    if (!form.registrationNumber.trim()) return false;
    if (!form.studentName.trim()) return false;
    if (!form.phone.trim()) return false;
    if (!form.department) return false;
    if (form.orderType === "delivery" && !form.deliveryLocation.trim()) {
      return false;
    }
    return items.length > 0;
  }, [form, items.length]);

  const validate = (): FormErrors => {
    const nextErrors: FormErrors = {};

    if (!form.registrationNumber.trim()) {
      nextErrors.registrationNumber = "Registration number is required.";
    }
    if (!form.studentName.trim()) {
      nextErrors.studentName = "Student name is required.";
    }
    if (!form.phone.trim()) {
      nextErrors.phone = "Phone number is required.";
    } else if (!/^03\d{9}$/.test(form.phone.replace(/\s/g, ""))) {
      nextErrors.phone = "Enter a valid Pakistani phone number (03XXXXXXXXX).";
    }
    if (!form.department) {
      nextErrors.department = "Department is required.";
    }
    if (form.orderType === "delivery" && !form.deliveryLocation.trim()) {
      nextErrors.deliveryLocation = "Delivery location is required.";
    }

    return nextErrors;
  };

  const handleOrderTypeChange = (orderType: OrderType) => {
    setForm((current) => ({
      ...current,
      orderType,
      paymentMethod: orderType === "pickup" ? "cash-pickup" : "cash-delivery",
    }));
    setErrors((current) => ({
      ...current,
      deliveryLocation: undefined,
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0 || items.length === 0) {
      return;
    }

    setIsSubmitting(true);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const orderNumber = generateOrderNumber();
    const order = buildOrder(orderNumber, form, items);
    const message = formatWhatsAppOrderMessage(order);
    const whatsappUrl = buildWhatsAppUrl(message);

    sessionStorage.setItem("unieats-last-order", JSON.stringify(order));

    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    clearCart();
    router.push("/order-success");
  };

  if (!isHydrated) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-4">
          <div className="h-10 w-64 rounded-xl bg-gray-200" />
          <div className="h-96 rounded-3xl bg-gray-100" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-lg rounded-3xl border border-[#6C2BD9]/10 bg-white/80 p-10 text-center shadow-xl backdrop-blur-sm">
          <h2 className="text-2xl font-bold text-gray-900">No items to checkout</h2>
          <p className="mt-3 text-gray-600">
            Add items to your cart before completing your order.
          </p>
          <Link
            href="/canteens"
            className="mt-8 inline-flex rounded-full bg-[#6C2BD9] px-8 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#F4C542] hover:text-[#2E1065]"
          >
            Browse Canteens
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
          Checkout
        </h1>
        <p className="mt-2 text-base text-white/80 sm:text-lg">
          Complete your order details.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]"
        noValidate
      >
        <section className="space-y-6 rounded-3xl border border-white/60 bg-white/90 p-6 shadow-xl shadow-[#6C2BD9]/5 backdrop-blur-sm sm:p-8">
          <h2 className="text-xl font-bold text-gray-900">Student Information</h2>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              id="registrationNumber"
              label="Registration Number"
              required
              value={form.registrationNumber}
              error={errors.registrationNumber}
              onChange={(value) =>
                setForm((current) => ({ ...current, registrationNumber: value }))
              }
              placeholder="2023-CS-101"
            />
            <Field
              id="studentName"
              label="Student Name"
              required
              value={form.studentName}
              error={errors.studentName}
              onChange={(value) =>
                setForm((current) => ({ ...current, studentName: value }))
              }
              placeholder="Ali Raza"
            />
            <Field
              id="phone"
              label="Phone Number"
              required
              value={form.phone}
              error={errors.phone}
              onChange={(value) =>
                setForm((current) => ({ ...current, phone: value }))
              }
              placeholder="03XXXXXXXXX"
            />
            <div>
              <label
                htmlFor="department"
                className="mb-2 block text-sm font-semibold text-gray-700"
              >
                Department <span className="text-red-500">*</span>
              </label>
              <select
                id="department"
                value={form.department}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    department: event.target.value,
                  }))
                }
                className={`w-full rounded-xl border bg-white px-4 py-3 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#6C2BD9]/20 ${
                  errors.department
                    ? "border-red-400 focus:border-red-400"
                    : "border-gray-200 focus:border-[#6C2BD9]"
                }`}
                aria-invalid={Boolean(errors.department)}
                aria-describedby={errors.department ? "department-error" : undefined}
              >
                {DEPARTMENTS.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
              {errors.department && (
                <p id="department-error" className="mt-1.5 text-sm text-red-600">
                  {errors.department}
                </p>
              )}
            </div>
          </div>

          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-gray-700">
              Order Type
            </legend>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  { value: "pickup", label: "Pickup" },
                  { value: "delivery", label: "Campus Delivery" },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-all ${
                    form.orderType === option.value
                      ? "border-[#6C2BD9] bg-[#F3EDFF] text-[#6C2BD9]"
                      : "border-gray-200 text-gray-700 hover:border-[#6C2BD9]/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="orderType"
                    value={option.value}
                    checked={form.orderType === option.value}
                    onChange={() => handleOrderTypeChange(option.value)}
                    className="accent-[#6C2BD9]"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          {form.orderType === "delivery" && (
            <Field
              id="deliveryLocation"
              label="Delivery Location"
              required
              value={form.deliveryLocation}
              error={errors.deliveryLocation}
              onChange={(value) =>
                setForm((current) => ({ ...current, deliveryLocation: value }))
              }
              placeholder="Building, Department, Block, etc."
            />
          )}

          <div>
            <label
              htmlFor="specialInstructions"
              className="mb-2 block text-sm font-semibold text-gray-700"
            >
              Special Instructions
            </label>
            <textarea
              id="specialInstructions"
              value={form.specialInstructions}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  specialInstructions: event.target.value,
                }))
              }
              rows={3}
              placeholder="Any notes for the canteen or rider..."
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm transition-colors focus:border-[#6C2BD9] focus:outline-none focus:ring-2 focus:ring-[#6C2BD9]/20"
            />
          </div>
        </section>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl border border-white/60 bg-white/90 p-6 shadow-xl shadow-[#6C2BD9]/10 backdrop-blur-sm">
            <h2 className="text-xl font-bold text-gray-900">Order Summary</h2>

            <div className="mt-4 space-y-5">
              {canteenGroups.map((group) => (
                <div key={group.canteenSlug}>
                  <h3 className="text-sm font-bold text-[#6C2BD9]">
                    {group.canteenName}
                  </h3>
                  <ul className="mt-2 space-y-2" role="list">
                    {group.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start justify-between gap-3 text-sm"
                      >
                        <span className="text-gray-700">
                          {item.quantity} × {item.name}
                        </span>
                        <span className="shrink-0 font-semibold text-gray-900">
                          {formatPrice(item.price * item.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 flex justify-between text-sm font-semibold text-gray-900">
                    <span>Canteen Total</span>
                    <span>{formatPrice(group.subtotal)}</span>
                  </p>
                </div>
              ))}
            </div>

            <dl className="mt-6 space-y-3 border-t border-gray-100 pt-4 text-sm">
              <div className="flex justify-between text-gray-600">
                <dt>Subtotal</dt>
                <dd className="font-semibold text-gray-900">
                  {formatPrice(subtotal)}
                </dd>
              </div>
              <div className="flex justify-between text-gray-600">
                <dt>
                  Delivery Fee
                  {form.orderType === "delivery" && canteenGroups.length > 0 && (
                    <span className="block text-xs font-normal text-gray-400">
                      {canteenGroups.length} canteen{canteenGroups.length > 1 ? "s" : ""} × Rs.{DELIVERY_FEE_PER_CANTEEN}
                    </span>
                  )}
                </dt>
                <dd className="font-semibold text-gray-900">
                  {formatPrice(deliveryFee)}
                </dd>
              </div>
              <div className="flex justify-between text-base">
                <dt className="font-bold text-gray-900">Grand Total</dt>
                <dd className="font-bold text-[#6C2BD9]">
                  {formatPrice(grandTotal)}
                </dd>
              </div>
            </dl>

            <p className="mt-4 rounded-xl bg-[#F3EDFF] px-4 py-3 text-sm text-[#6C2BD9]">
              Estimated preparation time: <strong>{prepTime}</strong>
            </p>

            <fieldset className="mt-6">
              <legend className="mb-3 text-sm font-semibold text-gray-700">
                Payment Method
              </legend>
              <div className="space-y-2">
                {(
                  [
                    { value: "cash-pickup", label: "Cash on Pickup" },
                    { value: "cash-delivery", label: "Cash on Delivery" },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm transition-all ${
                      form.paymentMethod === option.value
                        ? "border-[#6C2BD9] bg-[#F3EDFF] text-[#6C2BD9]"
                        : "border-gray-200 text-gray-700"
                    } ${
                      (option.value === "cash-pickup" &&
                        form.orderType !== "pickup") ||
                      (option.value === "cash-delivery" &&
                        form.orderType !== "delivery")
                        ? "hidden"
                        : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={option.value}
                      checked={form.paymentMethod === option.value}
                      onChange={() =>
                        setForm((current) => ({
                          ...current,
                          paymentMethod: option.value,
                        }))
                      }
                      className="accent-[#6C2BD9]"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#6C2BD9] px-8 py-4 text-base font-semibold text-white shadow-lg shadow-[#6C2BD9]/25 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#5B21B6] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                Placing Order...
              </>
            ) : (
              "Place Order"
            )}
          </button>
        </aside>
      </form>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function Field({
  id,
  label,
  required,
  value,
  error,
  onChange,
  placeholder,
}: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full rounded-xl border bg-white px-4 py-3 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#6C2BD9]/20 ${
          error
            ? "border-red-400 focus:border-red-400"
            : "border-gray-200 focus:border-[#6C2BD9]"
        }`}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
