import { QRCodeSVG } from 'qrcode.react';
import { Printer } from 'lucide-react';
import { Button, Modal } from './ui';

export interface QrStore { id: string; name: string; segment: string }

export function storeSignupUrl(storeId: string) {
  return `${window.location.origin}/cadastro/${storeId}`;
}

export function StoreQrModal({ title, stores, onClose }: { title: string; stores: QrStore[]; onClose: () => void }) {
  return <Modal title={title} onClose={onClose}>
    <div className="qr-list">
      {stores.length ? stores.map((s) => <div className="qr-item" key={s.id}>
        <QRCodeSVG value={storeSignupUrl(s.id)} size={200} level="M" marginSize={2} />
        <strong>{s.name}</strong>
        <small>{s.segment}</small>
        <a href={storeSignupUrl(s.id)} target="_blank" rel="noreferrer" className="table-secondary">{storeSignupUrl(s.id)}</a>
      </div>) : <p>Nenhuma loja encontrada.</p>}
    </div>
    <div className="modal-actions qr-actions"><Button variant="secondary" onClick={() => window.print()}><Printer size={15} /> Imprimir</Button><Button onClick={onClose}>Fechar</Button></div>
  </Modal>;
}
