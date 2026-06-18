---
name: react-solid-typescript
description: >
  Use esta skill ao criar ou refatorar componentes React com TypeScript neste projeto. Documenta
  como aplicar os cinco princípios SOLID no contexto de componentes funcionais React: SRP (separar
  responsabilidades em componentes menores), OCP (composição e render props), LSP (contratos de
  props consistentes), ISP (interfaces segregadas por responsabilidade), DIP (injetar dependências
  via props ou custom hooks). Acione quando o usuário pedir para criar componentes complexos,
  refatorar um componente grande, ou perguntar sobre estrutura/arquitetura de componentes React.
compatibility: "React 18+ com TypeScript"
license: Proprietary
---

# SOLID em React + TypeScript

---

## SRP — Single Responsibility

Cada componente tem uma única responsabilidade bem definida.

```typescript
// ❌ Um componente fazendo busca + formulário + lista + estatísticas
const UserDashboard: React.FC = () => { /* ... tudo junto */ };

// ✅ Separar em responsabilidades distintas
const UserDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => { fetchUser().then(setUser); }, []);
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
};

const UserForm: React.FC<{ user: User; onSave: (user: User) => void }> = ({ user, onSave }) => (
  <form>{/* ... */}</form>
);

const UserList: React.FC<{ users: User[] }> = ({ users }) => (
  <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>
);

const UserStats: React.FC<{ user: User }> = ({ user }) => (
  <div>{/* estatísticas */}</div>
);
```

---

## OCP — Open/Closed

Componentes abertos para extensão via composição, fechados para modificação.

```typescript
// Componente base extensível
interface ButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
}

const Button: React.FC<ButtonProps> = ({ onClick, children, variant = 'primary' }) => (
  <button className={`button button-${variant}`} onClick={onClick}>{children}</button>
);

// Extensão sem tocar no Button
const IconButton: React.FC<ButtonProps & { icon: string }> = ({ icon, children, ...props }) => (
  <Button {...props}>
    <span className="icon">{icon}</span>
    {children}
  </Button>
);

// Render props para listas genéricas
interface ListProps<T> {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}

const List = <T,>({ items, renderItem }: ListProps<T>) => (
  <ul>{items.map((item, i) => <li key={i}>{renderItem(item)}</li>)}</ul>
);

// Extensível sem modificar List
<List items={users} renderItem={(u) => <UserCard user={u} />} />
<List items={products} renderItem={(p) => <ProductCard product={p} />} />
```

---

## LSP — Liskov Substitution

Variações de componentes mantêm o mesmo contrato de props e são intercambiáveis.

```typescript
interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const TextInput: React.FC<InputProps> = ({ value, onChange, placeholder }) => (
  <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
);

// Mantém exatamente o mesmo contrato
const EmailInput: React.FC<InputProps> = ({ value, onChange, placeholder }) => (
  <input type="email" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? 'email@example.com'} />
);

// Podem ser trocados sem quebrar o código ao redor
const Form: React.FC = () => {
  const [text, setText] = useState('');
  return <TextInput value={text} onChange={setText} />; // pode virar EmailInput sem alteração
};
```

---

## ISP — Interface Segregation

Não force componentes a depender de props que não usam.

```typescript
// ❌ Interface monolítica
interface UserCardProps {
  user: User;
  onEdit: (user: User) => void;
  onDelete: (id: string) => void;
  onShare: (id: string) => void;
  onExport: (id: string) => void;
  showActions: boolean;
  showAvatar: boolean;
  showEmail: boolean;
}

// ✅ Interfaces segregadas — cada componente recebe só o que precisa
const UserAvatar: React.FC<{ user: User }> = ({ user }) => (
  <img src={user.avatar} alt={user.name} />
);

const UserInfo: React.FC<{ user: User; showEmail?: boolean }> = ({ user, showEmail }) => (
  <div>
    <h3>{user.name}</h3>
    {showEmail && <p>{user.email}</p>}
  </div>
);

const UserActions: React.FC<{ userId: string; onEdit: () => void; onDelete: () => void }> = ({ onEdit, onDelete }) => (
  <div>
    <button onClick={onEdit}>Editar</button>
    <button onClick={onDelete}>Excluir</button>
  </div>
);

// Composição no nível certo
const UserCard: React.FC<{ user: User }> = ({ user }) => (
  <div>
    <UserAvatar user={user} />
    <UserInfo user={user} showEmail />
    <UserActions userId={user.id} onEdit={() => {}} onDelete={() => {}} />
  </div>
);
```

---

## DIP — Dependency Inversion

Componentes dependem de abstrações (props/interfaces), não de implementações concretas.

```typescript
// ❌ Dependência hardcoded da implementação
const UserProfile: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    fetch('/api/user').then(r => r.json()).then(setUser); // acoplamento direto
  }, []);
  return <div>{user?.name}</div>;
};

// ✅ Injeção via props (testável + substituível)
interface UserService {
  getUser: () => Promise<User>;
  updateUser: (user: User) => Promise<void>;
}

const useUserService = (service: UserService) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  const loadUser = async () => {
    setLoading(true);
    setUser(await service.getUser());
    setLoading(false);
  };

  return { user, loading, loadUser };
};

const UserProfile: React.FC<{ service: UserService }> = ({ service }) => {
  const { user, loading, loadUser } = useUserService(service);
  useEffect(() => { loadUser(); }, []);

  if (loading) return <div>Carregando...</div>;
  return <div>{user?.name}</div>;
};

// Implementações concretas injetadas no ponto de uso
const apiService: UserService = {
  getUser: () => fetch('/api/user').then(r => r.json()),
  updateUser: (user) => fetch(`/api/user/${user.id}`, { method: 'PUT', body: JSON.stringify(user) }).then(() => {}),
};

const mockService: UserService = {
  getUser: async () => ({ id: '1', name: 'Test User', email: 'test@test.com', avatar: '' }),
  updateUser: async () => {},
};

<UserProfile service={apiService} />     // produção
<UserProfile service={mockService} />    // testes
```
