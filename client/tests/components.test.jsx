import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import Button from '../src/components/common/Button.jsx';
import DataTable from '../src/components/common/DataTable.jsx';
import Input from '../src/components/common/Input.jsx';
import Modal from '../src/components/common/Modal.jsx';
import Tabs from '../src/components/common/Tabs.jsx';
import { ToastProvider, useToast } from '../src/components/common/Toast.jsx';
import ConfusionMatrixChart from '../src/components/charts/ConfusionMatrixChart.jsx';
import ProbabilityGauge from '../src/components/prediction/ProbabilityGauge.jsx';
import ShapExplanation from '../src/components/prediction/ShapExplanation.jsx';
import { ThemeProvider } from '../src/context/ThemeContext.jsx';

const withTheme = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('ProbabilityGauge', () => {
  it('is an accessible meter that states the value and the risk in words', () => {
    withTheme(<ProbabilityGauge value={0.35} label="Chance of a delay" />);
    const m = screen.getByRole('meter');
    expect(m).toHaveAttribute('aria-valuenow', '0.35');
    expect(m).toHaveAttribute('aria-valuetext', '35% (medium risk)');
    expect(m).toHaveAccessibleName(/Chance of a delay: 35%, medium risk/);
  });

  it.each([[0.05, 'low risk'], [0.2, 'medium risk'], [0.39, 'medium risk'], [0.4, 'high risk'], [0.96, 'high risk']])('%s -> %s', (v, words) => {
    withTheme(<ProbabilityGauge value={v} label="x" />);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', expect.stringContaining(words));
  });

  it('clamps out-of-range and missing values instead of drawing nonsense', () => {
    const { rerender } = withTheme(<ProbabilityGauge value={7} label="x" />);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '1');
    rerender(<ThemeProvider><ProbabilityGauge value={-3} label="x" /></ThemeProvider>);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
    rerender(<ThemeProvider><ProbabilityGauge value={undefined} label="x" /></ThemeProvider>);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
  });

  it('supports a custom scale for rare events (cancellation)', () => {
    withTheme(<ProbabilityGauge value={0.1} max={0.25} zones={{ medium: 0.03, high: 0.08 }} digits={1} label="Cancel" />);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', '10.0% (high risk)');
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuemax', '0.25');
  });
});

describe('ShapExplanation', () => {
  const factors = [
    { feature: 'o_snow_band', value: 'heavy', shapValue: 0.6, direction: 'increases_delay_risk' },
    { feature: 'day_of_week', value: 'Tuesday', shapValue: -0.2, direction: 'decreases_delay_risk' },
  ];
  it('renders each factor with a readable name and says raises/lowers in words (not colour alone)', () => {
    render(<ShapExplanation factors={factors} />);
    const rows = screen.getAllByTestId('shap-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText(/Snow at origin/)).toBeInTheDocument();
    expect(within(rows[0]).getByText('raises risk')).toBeInTheDocument();
    expect(within(rows[1]).getByText('lowers risk')).toBeInTheDocument();
  });
  it('renders nothing without factors', () => {
    const { container } = render(<ShapExplanation factors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ConfusionMatrixChart', () => {
  it('shows counts and the share of each actual class', () => {
    render(<ConfusionMatrixChart matrix={[[700, 300], [100, 400]]} />);
    expect(screen.getByText('700')).toBeInTheDocument();
    expect(screen.getByText('400')).toBeInTheDocument();
    expect(screen.getByText('70.0% of actual on time')).toBeInTheDocument();
    expect(screen.getByText('80.0% of actual delayed')).toBeInTheDocument();
  });
});

describe('Button', () => {
  it('loading disables the button, marks it busy, and ignores clicks', async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const b = screen.getByRole('button', { name: /Save/ });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('aria-busy', 'true');
    await userEvent.setup().click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
  it('defaults to type=button so it never submits a form by accident', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

describe('Input', () => {
  it('ties label, hint and error text to the field', () => {
    const { rerender } = render(<Input label="Email" hint="We never share it" />);
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('We never share it');
    rerender(<Input label="Email" error="Enter a valid email" hint="hint" />);
    const f = screen.getByLabelText('Email');
    expect(f).toBeInvalid();
    expect(f).toHaveAccessibleDescription(expect.stringContaining('Enter a valid email'));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email');
  });
});

describe('DataTable', () => {
  const rows = [{ id: 1, n: 'b', v: 2 }, { id: 2, n: 'a', v: 10 }, { id: 3, n: 'c', v: null }];
  const columns = [{ key: 'n', header: 'Name', sortable: true }, { key: 'v', header: 'Value', sortable: true, align: 'right' }];
  const order = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent);

  it('sorts ascending, then descending, then back to original; empty values always last', async () => {
    render(<DataTable columns={columns} rows={rows} />);
    const user = userEvent.setup();
    expect(order()).toEqual(['b', 'a', 'c']);
    await user.click(screen.getByRole('button', { name: /Value/ }));
    expect(order()).toEqual(['b', 'a', 'c']); // 2, 10, null
    expect(screen.getByRole('columnheader', { name: /Value/ })).toHaveAttribute('aria-sort', 'ascending');
    await user.click(screen.getByRole('button', { name: /Value/ }));
    expect(order()).toEqual(['a', 'b', 'c']); // 10, 2, null (null last)
    await user.click(screen.getByRole('button', { name: /Value/ }));
    expect(order()).toEqual(['b', 'a', 'c']);
    await user.click(screen.getByRole('button', { name: /Name/ }));
    expect(order()).toEqual(['a', 'b', 'c']);
  });

  it('pages client-side and shows the range', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: i, n: `row${i}` }));
    render(<DataTable columns={[{ key: 'n', header: 'Name' }]} rows={many} pageSize={10} />);
    expect(screen.getAllByRole('row')).toHaveLength(11);
    expect(screen.getByText('1-10 of 25')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('11-20 of 25')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
  });

  it('shows an empty state instead of an empty table', () => {
    render(<DataTable columns={columns} rows={[]} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Nothing to show')).toBeInTheDocument();
  });
});

describe('Modal', () => {
  function Demo() {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button onClick={() => setOpen(true)}>open</button>
        <Modal open={open} onClose={() => setOpen(false)} title="Edit thing" description="Make changes" footer={<button>Save</button>}>
          <input aria-label="field" />
        </Modal>
      </div>
    );
  }

  it('is a labelled modal dialog, moves focus in, traps Tab, closes on Escape, and returns focus', async () => {
    render(<Demo />);
    const user = userEvent.setup();
    const opener = screen.getByText('open');
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Edit thing' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Make changes');
    expect(dialog).toContainElement(document.activeElement);
    expect(document.body.style.overflow).toBe('hidden');

    for (let i = 0; i < 8; i += 1) { await user.tab(); expect(dialog).toContainElement(document.activeElement); } // focus never leaves
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(opener).toHaveFocus();
  });
});

describe('Tabs', () => {
  it('uses arrow keys, Home and End, with roving tabindex', async () => {
    function T() {
      const [v, setV] = useState('a');
      return <Tabs tabs={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }]} value={v} onChange={setV} label="demo" />;
    }
    render(<T />);
    const user = userEvent.setup();
    const tab = (n) => screen.getByRole('tab', { name: n });
    expect(tab('A')).toHaveAttribute('aria-selected', 'true');
    expect(tab('B')).toHaveAttribute('tabindex', '-1');
    tab('A').focus();
    await user.keyboard('{ArrowRight}');
    expect(tab('B')).toHaveAttribute('aria-selected', 'true');
    expect(tab('B')).toHaveFocus();
    await user.keyboard('{End}');
    expect(tab('C')).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}'); // wraps
    expect(tab('A')).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowLeft}'); // wraps back
    expect(tab('C')).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Toast', () => {
  it('announces messages in a live region and can be dismissed', async () => {
    function T() { const t = useToast(); return <button onClick={() => t.error('Could not save', 'Server said no')}>go</button>; }
    render(<ToastProvider><T /></ToastProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByText('go'));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
    expect(screen.getByRole('alert')).toHaveTextContent('Server said no');
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
