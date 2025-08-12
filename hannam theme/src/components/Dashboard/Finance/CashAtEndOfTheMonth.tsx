
import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";

const CashAtEndOfTheMonth: React.FC = () => {
  // Chart state
  // State for dynamically loaded Chart component
  const [ChartComponent, setChartComponent] =
    useState<React.ComponentType<any> | null>(null);

  // Dynamically import react-apexcharts
  useEffect(() => {
    import("react-apexcharts").then((module) => {
      setChartComponent(() => module.default);
    });
  }, []);

  const series: number[] = [42.9, 20.0, 37.1];

  const options: ApexOptions = {
    chart: {
      toolbar: {
        show: false,
      },
    },
    labels: ["Cash Inflows", "Cash Outflows", "Remaining Cash"],
    colors: ["#37D80A", "#FD5812", "#605DFF"],
    legend: {
      show: true,
      position: "bottom",
      fontSize: "12px",
      horizontalAlign: "center",
      offsetX: 0,
      offsetY: -105,
      itemMargin: {
        horizontal: 8,
        vertical: 0,
      },
      labels: {
        colors: "#64748B",
      },
      markers: {
        size: 6,
        offsetX: -2,
        offsetY: -0.5,
        shape: "square",
      },
    },
    stroke: {
      width: 0,
    },
    plotOptions: {
      pie: {
        endAngle: 90,
        startAngle: -90,
        expandOnClick: false,
        donut: {
          size: "65%",
        },
      },
    },
    dataLabels: {
      enabled: true,
      style: {
        fontSize: "12px",
      },
      dropShadow: {
        enabled: false,
      },
      formatter: function (val: number) {
        return val.toFixed(1) + "%";
      },
      textAnchor: "middle",
    },
    tooltip: {
      y: {
        formatter: function (val: number) {
          return val + "%";
        },
      },
    },
  };

  return (
    <>
      <div className="trezo-card bg-white dark:bg-[#0c1427] p-[20px] md:p-[25px] rounded-md">
        <div className="trezo-card-header mb-[20px] flex items-center justify-between">
          <div className="trezo-card-title">
            <span className="block">Cash at End of the Month</span>
          </div>
        </div>
        <div className="trezo-card-content">
          <div className="-mt-[10px] h-[145px]">
            {ChartComponent ? (
              <ChartComponent
                options={options}
                series={series}
                type="donut"
                height={250}
                width={"100%"}
              />
            ) : (
              <div>Loading chart...</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default CashAtEndOfTheMonth;
