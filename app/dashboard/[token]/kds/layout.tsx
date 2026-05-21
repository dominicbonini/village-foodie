export default function KdsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-screen h-screen overflow-hidden m-0 p-0">
      {children}
    </div>
  )
}
