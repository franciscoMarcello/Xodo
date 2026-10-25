// Xodó Sensores: lê CPU, GPU e discos com a LibreHardwareMonitorLib (MPL-2.0) e responde em 127.0.0.1 no mesmo
// formato do servidor web do LibreHardwareMonitor, para o Xodó não depender do programa separado.
// Só lê o hardware quando o Xodó pede (no máximo 1x por segundo; discos 1x por minuto). Sem pedidos, fica parado.
// Só aceita "GET /data.json": não recebe nenhum dado de fora. Compilar com build.ps1 (C# 5, compilador do Windows).
using System;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using LibreHardwareMonitor.Hardware;

static class Program
{
    const int DefaultPort = 47085;
    static readonly object Gate = new object();
    static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
    static Computer pc;
    static DateTime fastAt = DateTime.MinValue, slowAt = DateTime.MinValue;
    static byte[] cache;
    static bool admin;

    static int Main(string[] args)
    {
        int port = DefaultPort;
        for (int i = 0; i + 1 < args.Length; i++) if (args[i] == "--port") port = int.Parse(args[i + 1], Inv);

        // A porta ocupada também impede duas cópias rodando ao mesmo tempo.
        var server = new TcpListener(IPAddress.Loopback, port);
        try { server.Start(); } catch (SocketException) { return 1; }

        // Sem administrador a CPU devolve temperatura, consumo e voltagem zerados (não são reais): manda só o uso.
        admin = new System.Security.Principal.WindowsPrincipal(System.Security.Principal.WindowsIdentity.GetCurrent())
            .IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
        pc = new Computer { IsCpuEnabled = true, IsGpuEnabled = true, IsStorageEnabled = true };
        pc.Open();
        while (true)
        {
            TcpClient c = server.AcceptTcpClient();
            ThreadPool.QueueUserWorkItem(Serve, c);
        }
    }

    static void Serve(object o)
    {
        using (var c = (TcpClient)o)
        {
            try
            {
                c.ReceiveTimeout = 2000; c.SendTimeout = 2000;
                var s = c.GetStream();
                var buf = new byte[2048]; int n = 0;
                // Lê só o cabeçalho, até a linha em branco.
                while (n < buf.Length && !HeaderDone(buf, n)) { int r = s.Read(buf, n, buf.Length - n); if (r <= 0) break; n += r; }
                bool ok = Encoding.ASCII.GetString(buf, 0, n).StartsWith("GET /data.json ", StringComparison.Ordinal);
                byte[] body = ok ? Snapshot() : Encoding.ASCII.GetBytes("not found");
                string head = string.Format(Inv, "HTTP/1.1 {0}\r\nContent-Type: {1}\r\nContent-Length: {2}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
                    ok ? "200 OK" : "404 Not Found", ok ? "application/json; charset=utf-8" : "text/plain", body.Length);
                var hb = Encoding.ASCII.GetBytes(head);
                s.Write(hb, 0, hb.Length); s.Write(body, 0, body.Length);
            }
            catch { }
        }
    }

    static bool HeaderDone(byte[] b, int n)
    {
        for (int i = 3; i < n; i++) if (b[i - 3] == '\r' && b[i - 2] == '\n' && b[i - 1] == '\r' && b[i] == '\n') return true;
        return false;
    }

    static byte[] Snapshot()
    {
        lock (Gate)
        {
            var now = DateTime.UtcNow;
            if (cache != null && (now - fastAt).TotalMilliseconds < 1000) return cache;
            bool slow = (now - slowAt).TotalSeconds >= 60;
            foreach (var hw in pc.Hardware) if (slow || hw.HardwareType != HardwareType.Storage) Update(hw);
            fastAt = now; if (slow) slowAt = now;
            cache = Encoding.UTF8.GetBytes(Json());
            return cache;
        }
    }

    static void Update(IHardware hw) { hw.Update(); foreach (var s in hw.SubHardware) Update(s); }

    static string Json()
    {
        var sb = new StringBuilder(32768);
        sb.Append("{\"Text\":\"Sensor\",\"Value\":\"\",\"ImageURL\":\"\",\"Xodo\":\"1\",\"Admin\":").Append(admin ? "true" : "false").Append(",\"Children\":[{\"Text\":\"PC\",\"Value\":\"\",\"ImageURL\":\"images_icon/computer.png\",\"Children\":[");
        bool first = true;
        foreach (var hw in pc.Hardware) { if (!first) sb.Append(','); first = false; Hardware(sb, hw); }
        sb.Append("]}]}");
        return sb.ToString();
    }

    static void Hardware(StringBuilder sb, IHardware hw)
    {
        sb.Append("{\"Text\":"); Str(sb, hw.Name);
        sb.Append(",\"Value\":\"\",\"ImageURL\":\"images_icon/").Append(Icon(hw.HardwareType)).Append("\",\"Children\":[");
        bool first = true;
        foreach (var sub in hw.SubHardware) { if (!first) sb.Append(','); first = false; Hardware(sb, sub); }
        foreach (SensorType t in Enum.GetValues(typeof(SensorType)))
        {
            if (!admin && hw.HardwareType == HardwareType.Cpu && t != SensorType.Load) continue;
            var list = hw.Sensors.Where(x => x.SensorType == t).OrderBy(x => x.Index).ToList();
            if (list.Count == 0) continue;
            if (!first) sb.Append(','); first = false;
            sb.Append("{\"Text\":\"").Append(Group(t)).Append("\",\"Value\":\"\",\"ImageURL\":\"\",\"Children\":[");
            for (int i = 0; i < list.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append("{\"Text\":"); Str(sb, list[i].Name);
                sb.Append(",\"Value\":"); Str(sb, Format(t, list[i].Value));
                sb.Append(",\"Type\":\"").Append(t.ToString()).Append("\",\"ImageURL\":\"images/transparent.png\",\"Children\":[]}");
            }
            sb.Append("]}");
        }
        sb.Append("]}");
    }

    static string Icon(HardwareType t)
    {
        switch (t)
        {
            case HardwareType.Cpu: return "cpu.png";
            case HardwareType.GpuAmd: return "ati.png";
            case HardwareType.GpuNvidia: return "nvidia.png";
            case HardwareType.GpuIntel: return "intel.png";
            case HardwareType.Storage: return "hdd.png";
            default: return "chip.png";
        }
    }

    // Os mesmos nomes de grupo do LibreHardwareMonitor (o Xodó procura por eles).
    static string Group(SensorType t)
    {
        switch (t)
        {
            case SensorType.Voltage: return "Voltages";
            case SensorType.Current: return "Currents";
            case SensorType.Power: return "Powers";
            case SensorType.Clock: return "Clocks";
            case SensorType.Temperature: return "Temperatures";
            case SensorType.Frequency: return "Frequencies";
            case SensorType.Fan: return "Fans";
            case SensorType.Flow: return "Flows";
            case SensorType.Control: return "Controls";
            case SensorType.Level: return "Levels";
            case SensorType.Factor: return "Factors";
            case SensorType.SmallData: return "Data";
            case SensorType.TimeSpan: return "Times";
            default: return t.ToString();
        }
    }

    static string Format(SensorType t, float? v)
    {
        if (!v.HasValue || float.IsNaN(v.Value)) return "-";
        float x = v.Value;
        if (t == SensorType.Temperature && x == 0) return "-"; // sensor sem leitura
        switch (t)
        {
            case SensorType.Voltage: return x.ToString("F3", Inv) + " V";
            case SensorType.Current: return x.ToString("F3", Inv) + " A";
            case SensorType.Power: return x.ToString("F1", Inv) + " W";
            case SensorType.Clock: return x.ToString("F1", Inv) + " MHz";
            case SensorType.Temperature: return x.ToString("F1", Inv) + " °C";
            case SensorType.Load:
            case SensorType.Control:
            case SensorType.Level: return x.ToString("F1", Inv) + " %";
            case SensorType.Fan: return x.ToString("F0", Inv) + " RPM";
            case SensorType.Data: return x.ToString("F1", Inv) + " GB";
            case SensorType.SmallData: return x.ToString("F1", Inv) + " MB";
            case SensorType.Throughput: return (x / 1024).ToString("F1", Inv) + " KB/s";
            default: return x.ToString("F3", Inv);
        }
    }

    static void Str(StringBuilder sb, string s)
    {
        sb.Append('"');
        foreach (char ch in s ?? "")
        {
            if (ch == '"' || ch == '\\') sb.Append('\\').Append(ch);
            else if (ch < ' ') sb.Append("\\u").Append(((int)ch).ToString("x4", Inv));
            else sb.Append(ch);
        }
        sb.Append('"');
    }
}
