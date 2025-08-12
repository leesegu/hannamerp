
import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";

const ExpenseBreakdown: React.FC = () => {
  // Chart
  // State for dynamically loaded Chart component
  const [ChartComponent, setChartComponent] =
    useState<React.ComponentType<any> | null>(null);

  // Dynamically import react-apexcharts
  useEffect(() => {
    import("react-apexcharts").then((module) => {
      setChartComponent(() => module.default);
    });
  }, []);

  const series = [30, 25, 20, 25];

  const options: ApexOptions = {
    labels: ["Sales", "Salaries", "Miscellaneous", "Marketing"],
    colors: ["#AD63F6", "#BF85FB", "#D7B5FD", "#E9D5FF"],
    legend: {
      show: true,
      position: "bottom",
      fontSize: "12px",
      horizontalAlign: "center",
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
    dataLabels: {
      enabled: true,
      style: {
        fontSize: "12px",
      },
      dropShadow: {
        enabled: false,
      },
    },
    stroke: {
      width: 0,
    },
    tooltip: {
      enabled: true,
      y: {
        formatter: function (val) {
          return val + "%";
        },
      },
    },
    plotOptions: {
      pie: {
        dataLabels: {
          offset: -5,
        },
        expandOnClick: true,
      },
    },
  };

  return (
    <>
      <div className="trezo-card bg-white dark:bg-[#0c1427] p-[20px] md:p-[25px] rounded-md">
        <div className="trezo-card-header mb-[20px] md:mb-[25px] flex items-center justify-between">
          <div className="trezo-card-title">
            <h5 className="!mb-0">Expense Breakdown</h5>
          </div>
        </div>
        <div className="trezo-card-content">
          <div className="-mt-[10px]">
            {ChartComponent ? (
              <ChartComponent
                options={options}
                series={series}
                type="pie"
                height={230}
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

export default ExpenseBreakdown;
