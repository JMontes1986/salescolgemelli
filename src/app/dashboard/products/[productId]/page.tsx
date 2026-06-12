import ProductPurchasersClient from "./ProductPurchasersClient";

export default function ProductPurchasersPage(props: any) {
  return <ProductPurchasersClient productId={props.params?.productId} />;
}
